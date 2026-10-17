import type { NormalisedMessage } from "./whatsapp-types";

/**
 * Instagram and Messenger webhook payloads.
 *
 * A different shape to WhatsApp: `entry[].messaging[]` rather than
 * `entry[].changes[].value.messages[]`, and senders are opaque scoped IDs
 * rather than phone numbers.
 *
 * Both normalise to the same `NormalisedMessage` the rest of the system
 * already works on. That is the point of the adapter boundary — the agent
 * never learns which channel a message came from unless it asks.
 */

export interface MessagingWebhookBody {
  object: string; // "instagram" | "page"
  entry?: MessagingEntry[];
}

interface MessagingEntry {
  id: string; // Instagram account id, or Page id for Messenger
  time?: number;
  messaging?: MessagingEvent[];
}

interface MessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean; // our own outbound, reflected back
    attachments?: {
      type: string; // image | video | audio | file | share | story_mention
      payload?: { url?: string };
    }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
}

/**
 * Flatten one messaging webhook into our model.
 *
 * Echoes are dropped: Meta reflects our own outbound messages back, and
 * recording them would make the agent reply to itself.
 */
export function extractMessagingMessages(
  body: MessagingWebhookBody
): NormalisedMessage[] {
  const provider = body.object === "instagram" ? "instagram" : "messenger";
  const out: NormalisedMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const sender = event.sender?.id;
      if (!sender) continue;

      // Our own message coming back to us.
      if (event.message?.is_echo) continue;

      let text = "";
      let mediaId: string | undefined;
      let messageType = "text";
      let id = event.message?.mid ?? event.postback?.mid;

      if (event.message?.text) {
        text = event.message.text;
      } else if (event.message?.attachments?.length) {
        const first = event.message.attachments[0];
        messageType = first.type;
        mediaId = first.payload?.url;
        // A readable placeholder, so the classifier has something to act on.
        text =
          first.type === "story_mention"
            ? "[mentioned you in a story]"
            : first.type === "share"
              ? "[shared a post]"
              : `[${first.type}]`;
      } else if (event.postback) {
        messageType = "postback";
        text = event.postback.title ?? event.postback.payload ?? "[button]";
      } else {
        continue; // read receipts, reactions, delivery — not messages
      }

      if (!id) id = `${provider}.${sender}.${event.timestamp ?? Date.now()}`;

      out.push({
        providerMessageId: id,
        provider: provider as NormalisedMessage["provider"],
        // The account the message was sent TO — the routing key.
        providerPhoneNumberId: entry.id,
        wabaId: entry.id,
        from: sender,
        senderName: undefined, // needs a separate profile lookup
        text,
        messageType,
        mediaId,
        receivedAt: new Date(event.timestamp ?? Date.now()),
        raw: event,
      });
    }
  }

  return out;
}

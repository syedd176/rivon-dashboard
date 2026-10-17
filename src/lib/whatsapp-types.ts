/**
 * Shapes of what Meta sends to the webhook, and what we turn it into.
 *
 * Meta's payload is deeply nested and channel-specific. Everything downstream
 * works on `NormalisedMessage` instead, so adding Instagram or Messenger later
 * means writing one more parser, not changing the agent.
 */

// ---------- what Meta sends ----------

export interface WhatsAppWebhookBody {
  object: string;
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  id: string; // the WABA id
  changes?: WebhookChange[];
}

interface WebhookChange {
  field: string; // "messages" for inbound
  value?: {
    messaging_product?: string;
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    contacts?: { profile?: { name?: string }; wa_id?: string }[];
    messages?: InboundMessage[];
    statuses?: MessageStatus[];
  };
}

export interface InboundMessage {
  id: string; // wamid... — unique per message
  from: string; // sender's phone number
  timestamp: string; // unix seconds, as a string
  type: string; // text | image | audio | document | interactive | ...
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; filename?: string; mime_type?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

export interface MessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string }[];
}

// ---------- what the rest of the system sees ----------

export interface NormalisedMessage {
  /** Provider's id. Unique per (tenant, provider_message_id) — the dedupe key. */
  providerMessageId: string;
  provider: "whatsapp" | "instagram" | "messenger";
  /** Routes to a tenant. The first lookup any inbound does. */
  providerPhoneNumberId: string;
  wabaId: string;
  from: string;
  senderName?: string;
  /** Plain text for any message type we can render as words. */
  text: string;
  /** The original type, so handlers can branch when they need to. */
  messageType: string;
  /** Media id, when there is one. Fetched separately, not on this path. */
  mediaId?: string;
  receivedAt: Date;
  /** Everything Meta sent, kept verbatim. Useful when something is wrong. */
  raw: unknown;
}

/**
 * Flatten one Meta message into our model.
 *
 * Non-text types get a readable placeholder rather than an empty string —
 * "[image]" is something the classifier can act on; "" is not.
 */
export function normalise(
  message: InboundMessage,
  phoneNumberId: string,
  wabaId: string,
  senderName?: string
): NormalisedMessage {
  let text = "";
  let mediaId: string | undefined;

  switch (message.type) {
    case "text":
      text = message.text?.body ?? "";
      break;
    case "image":
      mediaId = message.image?.id;
      text = message.image?.caption ?? "[image]";
      break;
    case "audio":
      mediaId = message.audio?.id;
      text = "[voice note]";
      break;
    case "document":
      mediaId = message.document?.id;
      text = message.document?.filename
        ? `[document: ${message.document.filename}]`
        : "[document]";
      break;
    case "button":
      // Quick-reply on a template — this is how an owner approves a quote.
      text = message.button?.text ?? message.button?.payload ?? "[button]";
      break;
    case "interactive":
      text =
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title ??
        "[interactive reply]";
      break;
    default:
      text = `[${message.type}]`;
  }

  return {
    providerMessageId: message.id,
    provider: "whatsapp",
    providerPhoneNumberId: phoneNumberId,
    wabaId,
    from: message.from,
    senderName,
    text,
    messageType: message.type,
    mediaId,
    receivedAt: new Date(Number(message.timestamp) * 1000),
    raw: message,
  };
}

/** Pull every inbound message out of a webhook body, already normalised. */
export function extractMessages(
  body: WhatsAppWebhookBody
): NormalisedMessage[] {
  const out: NormalisedMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value?.messages?.length) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const senderName = value.contacts?.[0]?.profile?.name;

      for (const message of value.messages) {
        out.push(normalise(message, phoneNumberId, entry.id, senderName));
      }
    }
  }

  return out;
}

/** Delivery receipts: sent, delivered, read, failed. */
export function extractStatuses(body: WhatsAppWebhookBody): MessageStatus[] {
  const out: MessageStatus[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      out.push(...(change.value?.statuses ?? []));
    }
  }
  return out;
}

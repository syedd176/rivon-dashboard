import type { NormalisedMessage } from "./whatsapp-types";

/**
 * Instagram comment webhooks.
 *
 * A comment is NOT a message, and the difference drives the design:
 *
 *   - it is PUBLIC — everyone who sees the post sees the reply
 *   - there is no 24-hour window; a comment can be replied to any time
 *   - one post can draw dozens at once
 *   - a wrong public reply is screenshot-able in a way a wrong DM is not
 *
 * So comments are normalised into the same inbox for visibility, but marked
 * `messageType: "comment"` so handlers can treat them differently. The reply
 * path is deliberately separate.
 */

export interface CommentWebhookBody {
  object: string; // "instagram"
  entry?: CommentEntry[];
}

interface CommentEntry {
  id: string; // the Instagram account id
  time?: number;
  changes?: {
    field: string; // "comments"
    value?: CommentValue;
  }[];
}

interface CommentValue {
  id: string; // comment id — what you reply to
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  parent_id?: string; // present when this is a reply to another comment
}

export interface InstagramComment extends NormalisedMessage {
  commentId: string;
  mediaId?: string;
  /** True when this is a reply within a thread, not a top-level comment. */
  isReply: boolean;
}

export function extractComments(body: CommentWebhookBody): InstagramComment[] {
  const out: InstagramComment[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const c = change.value;
      if (!c?.id) continue;

      // Our own replies come back through the same webhook. Recording them
      // would have the agent answering itself in public.
      if (c.from?.id && c.from.id === entry.id) continue;

      out.push({
        providerMessageId: `comment.${c.id}`,
        provider: "instagram",
        providerPhoneNumberId: entry.id, // routes to the tenant
        wabaId: entry.id,
        from: c.from?.id ?? "unknown",
        senderName: c.from?.username ? `@${c.from.username}` : undefined,
        text: c.text ?? "",
        messageType: "comment",
        mediaId: c.media?.id,
        receivedAt: new Date((entry.time ?? Date.now() / 1000) * 1000),
        raw: change,
        commentId: c.id,
        isReply: Boolean(c.parent_id),
      });
    }
  }

  return out;
}

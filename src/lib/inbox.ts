import type { NormalisedMessage, MessageStatus } from "./whatsapp-types";

/**
 * A temporary in-memory inbox.
 *
 * WHAT THIS REPLACES, and will be replaced BY:
 *   - `messages` in Postgres, with a unique (tenant_id, provider_message_id)
 *   - the `inbound` Celery queue
 *
 * It exists so the webhook path can be proven end to end before the backend
 * does. Two properties that will NOT survive a restart or a second serverless
 * instance, and which the real version must provide:
 *
 *   - durability — anything here is lost on redeploy
 *   - shared state — each Vercel instance has its own copy
 *
 * That is acceptable for proving the path and nothing else. Do not build
 * conversation logic on top of this.
 */

const MAX = 50;

const messages: NormalisedMessage[] = [];
const statuses: MessageStatus[] = [];

/** Dedupe keys we have already seen, mirroring the real unique constraint. */
const seen = new Set<string>();

export function recordInbound(message: NormalisedMessage) {
  // Meta retries on any non-200, so the same message id can arrive twice.
  // In Postgres this is a unique constraint; here it is a set.
  if (seen.has(message.providerMessageId)) return;
  seen.add(message.providerMessageId);

  messages.unshift(message);
  if (messages.length > MAX) messages.length = MAX;
}

export function recordStatus(status: MessageStatus) {
  statuses.unshift(status);
  if (statuses.length > MAX) statuses.length = MAX;
}

export function getInbox() {
  return {
    messages: messages.slice(),
    statuses: statuses.slice(),
  };
}

import { neon } from "@neondatabase/serverless";
import type { NormalisedMessage, MessageStatus } from "./whatsapp-types";

/**
 * Message storage, in Postgres.
 *
 * Replaces the in-memory version, which could not work on serverless: each
 * invocation may run on a different instance, so a message written by the
 * webhook was invisible to the page reading it.
 *
 * This is a first slice of the real `messages` table in SYSTEM_DESIGN.md §10.
 * Two things it already does that the real one must:
 *
 *   - append-only, never updated in place
 *   - unique on (provider, provider_message_id), so a webhook retry is a
 *     no-op rather than a duplicate reply to a real customer
 *
 * Still missing, and deliberately: tenant_id and the row-level security that
 * goes with it. There is one tenant today. The column lands when there are two.
 */

function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

let ready: Promise<void> | null = null;

/** Create the tables on first use. Cheap, and avoids a migration step today. */
function ensureSchema() {
  if (ready) return ready;
  const sql = db();
  ready = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS inbound_messages (
        id                  BIGSERIAL PRIMARY KEY,
        provider            TEXT        NOT NULL,
        provider_message_id TEXT        NOT NULL,
        phone_number_id     TEXT        NOT NULL,
        waba_id             TEXT,
        sender              TEXT        NOT NULL,
        sender_name         TEXT,
        body                TEXT        NOT NULL,
        message_type        TEXT        NOT NULL,
        media_id            TEXT,
        received_at         TIMESTAMPTZ NOT NULL,
        raw                 JSONB       NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (provider, provider_message_id)
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS message_statuses (
        id                  BIGSERIAL PRIMARY KEY,
        provider_message_id TEXT        NOT NULL,
        status              TEXT        NOT NULL,
        recipient           TEXT,
        error_title         TEXT,
        occurred_at         TIMESTAMPTZ NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE INDEX IF NOT EXISTS inbound_messages_received_idx
        ON inbound_messages (received_at DESC)`;
  })();
  return ready;
}

export async function recordInbound(message: NormalisedMessage) {
  await ensureSchema();
  const sql = db();
  // ON CONFLICT is the dedupe. Meta retries on any non-200, so the same
  // message id genuinely does arrive more than once.
  await sql`
    INSERT INTO inbound_messages (
      provider, provider_message_id, phone_number_id, waba_id,
      sender, sender_name, body, message_type, media_id, received_at, raw
    ) VALUES (
      ${message.provider}, ${message.providerMessageId},
      ${message.providerPhoneNumberId}, ${message.wabaId},
      ${message.from}, ${message.senderName ?? null}, ${message.text},
      ${message.messageType}, ${message.mediaId ?? null},
      ${message.receivedAt.toISOString()}, ${JSON.stringify(message.raw)}
    )
    ON CONFLICT (provider, provider_message_id) DO NOTHING`;
}

export async function recordStatus(status: MessageStatus) {
  await ensureSchema();
  const sql = db();
  await sql`
    INSERT INTO message_statuses (
      provider_message_id, status, recipient, error_title, occurred_at
    ) VALUES (
      ${status.id}, ${status.status}, ${status.recipient_id},
      ${status.errors?.[0]?.title ?? null},
      ${new Date(Number(status.timestamp) * 1000).toISOString()}
    )`;
}

export async function getInbox() {
  await ensureSchema();
  const sql = db();

  const messages = await sql`
    SELECT provider_message_id, provider, phone_number_id, waba_id,
           sender, sender_name, body, message_type, media_id, received_at
    FROM inbound_messages
    ORDER BY received_at DESC
    LIMIT 50`;

  const statuses = await sql`
    SELECT provider_message_id, status, recipient, error_title, occurred_at
    FROM message_statuses
    ORDER BY occurred_at DESC
    LIMIT 20`;

  return {
    messages: messages.map((r) => ({
      providerMessageId: r.provider_message_id as string,
      provider: r.provider as "whatsapp",
      providerPhoneNumberId: r.phone_number_id as string,
      wabaId: r.waba_id as string,
      from: r.sender as string,
      senderName: (r.sender_name ?? undefined) as string | undefined,
      text: r.body as string,
      messageType: r.message_type as string,
      mediaId: (r.media_id ?? undefined) as string | undefined,
      receivedAt: r.received_at as string,
      raw: null,
    })),
    statuses: statuses.map((r) => ({
      id: r.provider_message_id as string,
      status: r.status as MessageStatus["status"],
      recipient_id: r.recipient as string,
      timestamp: String(
        Math.floor(new Date(r.occurred_at as string).getTime() / 1000)
      ),
      errors: r.error_title
        ? [{ code: 0, title: r.error_title as string }]
        : undefined,
    })),
  };
}

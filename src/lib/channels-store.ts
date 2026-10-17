import { neon } from "@neondatabase/serverless";

/**
 * Connected channel credentials.
 *
 * A first slice of the `channels` table from SYSTEM_DESIGN.md §10. Its most
 * important job is the routing lookup every inbound webhook performs:
 *
 *     provider_phone_number_id → tenant
 *
 * Get that wrong and one business's customers reach another business's agent.
 *
 * ⚠️ Tokens are stored in plain text here. The design requires them encrypted
 * at rest (§10, channels: "tokens encrypted at rest"), and that must land
 * before a second tenant exists. Today there is one, and it is us.
 */

function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

let ready: Promise<void> | null = null;

function ensureSchema() {
  if (ready) return ready;
  const sql = db();
  ready = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS channels (
        id                  BIGSERIAL PRIMARY KEY,
        provider            TEXT        NOT NULL,
        provider_phone_number_id TEXT   NOT NULL,
        waba_id             TEXT,
        business_id         TEXT,
        display_number      TEXT,
        access_token        TEXT        NOT NULL,
        status              TEXT        NOT NULL DEFAULT 'connected',
        connected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_health_check   TIMESTAMPTZ,
        UNIQUE (provider, provider_phone_number_id)
      )`;
  })();
  return ready;
}

export interface ChannelRecord {
  providerPhoneNumberId: string;
  wabaId?: string;
  businessId?: string;
  displayNumber?: string;
  accessToken: string;
}

export async function saveChannel(c: ChannelRecord) {
  await ensureSchema();
  const sql = db();
  // Reconnecting replaces the token rather than creating a second row.
  await sql`
    INSERT INTO channels (
      provider, provider_phone_number_id, waba_id, business_id,
      display_number, access_token, status, last_health_check
    ) VALUES (
      'whatsapp', ${c.providerPhoneNumberId}, ${c.wabaId ?? null},
      ${c.businessId ?? null}, ${c.displayNumber ?? null},
      ${c.accessToken}, 'connected', now()
    )
    ON CONFLICT (provider, provider_phone_number_id) DO UPDATE SET
      access_token      = EXCLUDED.access_token,
      waba_id           = EXCLUDED.waba_id,
      business_id       = EXCLUDED.business_id,
      display_number    = EXCLUDED.display_number,
      status            = 'connected',
      last_health_check = now()`;
}

/**
 * Credentials for sending on a given number.
 *
 * Falls back to the environment so the test number still works while the
 * Embedded Signup connection is the only stored channel.
 */
export async function getSendCredentials(
  phoneNumberId?: string
): Promise<{ phoneNumberId: string; accessToken: string } | null> {
  try {
    await ensureSchema();
    const sql = db();

    const rows = phoneNumberId
      ? await sql`
          SELECT provider_phone_number_id, access_token FROM channels
          WHERE provider = 'whatsapp'
            AND provider_phone_number_id = ${phoneNumberId}
            AND status = 'connected'
          LIMIT 1`
      : await sql`
          SELECT provider_phone_number_id, access_token FROM channels
          WHERE provider = 'whatsapp' AND status = 'connected'
          ORDER BY connected_at DESC
          LIMIT 1`;

    if (rows.length) {
      return {
        phoneNumberId: rows[0].provider_phone_number_id as string,
        accessToken: rows[0].access_token as string,
      };
    }
  } catch {
    // Database unavailable — fall through to the environment.
  }

  const envId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (envId && envToken) {
    return { phoneNumberId: envId, accessToken: envToken };
  }
  return null;
}

export async function listChannels() {
  await ensureSchema();
  const sql = db();
  return sql`
    SELECT provider_phone_number_id, waba_id, display_number, status,
           connected_at, last_health_check
    FROM channels WHERE provider = 'whatsapp'
    ORDER BY connected_at DESC`;
}

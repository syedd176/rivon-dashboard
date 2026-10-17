import { NextResponse, connection } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * Refresh Instagram Login tokens before they expire.
 *
 * These last ~60 days. A token not refreshed within that window expires and
 * CANNOT be recovered — the tenant has to reconnect, and in the meantime
 * their messages silently stop arriving. That is the failure this prevents.
 *
 * Refreshing is only permitted on a token at least 24 hours old, and each
 * refresh extends it by another 60 days. Run this daily and anything within
 * two weeks of expiry gets extended.
 *
 * Facebook Page tokens never expire, so they are skipped — they are the rows
 * with a null expires_at.
 */

function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function GET() {
  // Reads the database; cannot be prerendered.
  await connection();
  const sql = db();

  // Anything expiring within 14 days. Generous, because a missed window is
  // unrecoverable and a redundant refresh costs nothing.
  const due = await sql`
    SELECT id, external_id, display_name, access_token, expires_at
    FROM social_channels
    WHERE provider = 'instagram'
      AND status = 'connected'
      AND expires_at IS NOT NULL
      AND expires_at < now() + interval '14 days'`;

  const results: { account: string; ok: boolean; detail?: string }[] = [];

  for (const row of due) {
    const name = (row.display_name as string) ?? (row.external_id as string);
    try {
      const res = await fetch(
        "https://graph.instagram.com/refresh_access_token?" +
          new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: row.access_token as string,
          })
      );
      const body = await res.json();

      if (!res.ok || !body.access_token) {
        // Mark it so the dashboard can show "needs attention" rather than
        // letting the tenant discover it when a customer gets no reply.
        await sql`
          UPDATE social_channels SET status = 'degraded'
          WHERE id = ${row.id}`;
        results.push({
          account: name,
          ok: false,
          detail: body?.error?.message ?? "refresh refused",
        });
        continue;
      }

      await sql`
        UPDATE social_channels
        SET access_token = ${body.access_token},
            expires_at   = ${new Date(
              Date.now() + (body.expires_in ?? 5184000) * 1000
            ).toISOString()},
            status       = 'connected',
            last_health_check = now()
        WHERE id = ${row.id}`;

      results.push({ account: name, ok: true });
    } catch (e) {
      results.push({
        account: name,
        ok: false,
        detail: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ checked: due.length, results });
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Step 2 of connecting a channel: Meta sends the owner back here with a code.
 *
 * WHAT STILL HAS TO HAPPEN HERE (each marked TODO below):
 *   1. Verify `state` matches the cookie we set — CSRF protection
 *   2. Exchange `code` for a long-lived access token (server-side, app secret)
 *   3. Call Meta to discover the WABA id and phone number id, or the Page id
 *   4. Store encrypted in the `channels` table, keyed by tenant
 *   5. Subscribe to webhooks for that asset so messages start arriving
 *   6. Send a verification message to prove the path works end to end
 *
 * Step 4 is the one that matters most: `provider_phone_number_id → tenant_id`
 * is the routing key every inbound webhook is resolved against. Get it wrong
 * and one business's customers reach another business's agent.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const url = req.nextUrl;

  const error = url.searchParams.get("error");
  if (error) {
    // Owner cancelled, or Meta refused. Not a failure worth alarming them about.
    const reason =
      url.searchParams.get("error_reason") === "user_denied"
        ? "cancelled"
        : "denied";
    return NextResponse.redirect(
      new URL(`/channels?result=${reason}&provider=${provider}`, url)
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get(`oauth_state_${provider}`)?.value;

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      new URL(`/channels?result=invalid_state&provider=${provider}`, url)
    );
  }

  // TODO 2 — exchange the code for a token:
  //   POST https://graph.facebook.com/v21.0/oauth/access_token
  //     client_id, client_secret, redirect_uri, code
  //
  // TODO 3 — discover the asset:
  //   WhatsApp:  GET /{business-id}/owned_whatsapp_business_accounts
  //              then /{waba-id}/phone_numbers
  //   Messenger: GET /me/accounts  → page id + page access token
  //   Instagram: GET /{page-id}?fields=instagram_business_account
  //
  // TODO 4 — persist, encrypted, against this tenant:
  //   channels(tenant_id, provider, provider_phone_number_id, waba_id,
  //            encrypted_token, status, last_health_check)
  //
  // TODO 5 — subscribe to webhooks:
  //   POST /{waba-id}/subscribed_apps   (WhatsApp)
  //   POST /{page-id}/subscribed_apps   (Messenger, Instagram)
  //
  // TODO 6 — send a verification message and only then mark `connected`.

  const res = NextResponse.redirect(
    new URL(`/channels?result=pending_backend&provider=${provider}`, url)
  );
  res.cookies.delete(`oauth_state_${provider}`);
  return res;
}

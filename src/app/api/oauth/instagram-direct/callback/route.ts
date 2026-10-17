import { NextRequest, NextResponse } from "next/server";
import { saveSocialChannel } from "@/lib/channels-store";

/**
 * Instagram Login callback.
 *
 * THREE CALLS:
 *   1. Code → short-lived token (api.instagram.com)
 *   2. Short-lived → long-lived, 60 days (graph.instagram.com)
 *   3. Read the username, so the owner sees which account connected
 *
 * Two details that break this if missed:
 *   - the code arrives with a trailing "#_" which must be stripped
 *   - the token response is a `data` ARRAY, not a flat object
 *
 * Both are specific to this API and neither resembles the Facebook Login
 * flow next door.
 */

export async function GET(req: NextRequest) {
  const url = req.nextUrl;

  if (url.searchParams.get("error")) {
    const denied = url.searchParams.get("error_reason") === "user_denied";
    return redirect(req, denied ? "cancelled" : "denied");
  }

  const rawCode = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("oauth_state_ig_direct")?.value;

  if (!rawCode || !state || !expected || state !== expected) {
    return redirect(req, "invalid_state");
  }

  // Instagram appends "#_" to the code. Left on, the exchange fails.
  const code = rawCode.replace(/#_$/, "");

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) return redirect(req, "not_configured");

  const origin = process.env.APP_URL ?? url.origin;
  const redirectUri = `${origin}/api/oauth/instagram-direct/callback`;

  try {
    // 1. Code → short-lived token.
    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const shortBody = await shortRes.json();

    // The response wraps everything in a `data` array.
    const first = shortBody?.data?.[0] ?? shortBody;
    const shortToken: string | undefined = first?.access_token;
    const userId: string | undefined = first?.user_id
      ? String(first.user_id)
      : undefined;

    if (!shortRes.ok || !shortToken || !userId) {
      return redirect(req, "exchange_failed");
    }

    // 2. Short-lived → long-lived. Without this it expires in about an hour.
    const longRes = await fetch(
      "https://graph.instagram.com/access_token?" +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: shortToken,
        })
    );
    const longBody = await longRes.json();
    const token: string = longBody?.access_token ?? shortToken;
    // ~60 days. Must be refreshed before then or the tenant goes dark.
    const expiresIn: number | undefined = longBody?.expires_in;

    // 3. Who connected? Shown to the owner so they can confirm.
    let username: string | undefined;
    const meRes = await fetch(
      `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${token}`
    );
    if (meRes.ok) {
      const me = await meRes.json();
      username = me?.username;
    }

    await saveSocialChannel({
      provider: "instagram",
      externalId: userId, // routes inbound Instagram webhooks
      pageId: userId, // no Page here; the account is its own sender
      displayName: username ? `@${username}` : undefined,
      accessToken: token,
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : undefined,
    });

    const res = redirect(req, "connected");
    res.cookies.delete("oauth_state_ig_direct");
    return res;
  } catch {
    return redirect(req, "error");
  }
}

function redirect(req: NextRequest, result: string) {
  return NextResponse.redirect(
    new URL(`/channels?result=${result}&provider=instagram`, req.nextUrl)
  );
}

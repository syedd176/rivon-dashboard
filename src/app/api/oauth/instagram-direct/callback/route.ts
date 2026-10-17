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
      // Meta says exactly what is wrong — a bad secret, a mismatched
      // redirect URI, an expired code. Swallowing it leaves the owner with
      // nothing to act on, so pass the reason through.
      const why =
        shortBody?.error_message ??
        shortBody?.error?.message ??
        shortBody?.error_type ??
        "unknown";
      return redirect(
        req,
        `exchange_failed&detail=${encodeURIComponent("step 1 (code exchange): " + String(why).slice(0, 150))}`
      );
    }

    // 2. Short-lived → long-lived. Without this the token dies in about an
    //    hour, and a short-lived token cannot call /me or be refreshed — so
    //    a silent fallback here produces a connection that looks fine and
    //    stops working before anyone notices. Fail loudly instead.
    // Explicit GET with no extra headers. Anything that makes fetch send a
    // body or a content-type turns this into a request Meta reports as
    // "Unsupported request - method type: get".
    // Some Instagram tokens arrive already URL-encoded. Running them through
    // URLSearchParams encodes them a second time, and Meta then fails to
    // parse the token — reporting it, unhelpfully, as a method error.
    const cleanShort = decodeURIComponent(shortToken);

    const longUrl =
      "https://graph.instagram.com/access_token" +
      `?grant_type=ig_exchange_token` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&access_token=${encodeURIComponent(cleanShort)}`;

    let longRes = await fetch(longUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    let longBody = await longRes.json();

    // The documented GET is being refused with a method error that direct
    // curl calls do not reproduce. Try the same parameters as a POST before
    // giving up — some Instagram token endpoints accept both, and a working
    // connection matters more than matching the documented verb.
    if (!longRes.ok && longBody?.error?.code === 100) {
      longRes = await fetch("https://graph.instagram.com/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: cleanShort,
        }),
      });
      longBody = await longRes.json();
      console.log("ig long-lived retried as POST", {
        status: longRes.status,
        ok: longRes.ok,
      });
    }

    // Surface the token shape when this fails, since "Failed to decrypt"
    // and a method error look identical from the outside.
    if (!longRes.ok) {
      console.error("ig long-lived exchange failed", {
        status: longRes.status,
        body: longBody,
        shortTokenPrefix: shortToken.slice(0, 6),
        shortTokenLength: shortToken.length,
        hadPercentEncoding: shortToken !== decodeURIComponent(shortToken),
        tail: shortToken.slice(-6),
      });
    }

    if (!longRes.ok || !longBody?.access_token) {
      const why =
        longBody?.error?.message ??
        longBody?.error_message ??
        "could not obtain a long-lived token";
      return redirect(
        req,
        `exchange_failed&detail=${encodeURIComponent("step 2 (long-lived): " + String(why).slice(0, 150))}`
      );
    }

    const token: string = longBody.access_token;
    // ~60 days. Must be refreshed before then or the tenant goes dark.
    const expiresIn: number | undefined = longBody?.expires_in;

    // 3. Who connected? Shown to the owner so they can confirm the right
    //    account was linked. Best-effort — a missing name is cosmetic.
    let username: string | undefined;
    try {
      const meRes = await fetch(
        `https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=${token}`
      );
      if (meRes.ok) {
        const me = await meRes.json();
        username = me?.username;
      }
    } catch {
      // Leave it unnamed rather than failing a working connection.
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

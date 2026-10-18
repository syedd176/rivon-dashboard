import { NextRequest, NextResponse } from "next/server";
import { saveSocialChannel } from "@/lib/channels-store";

/**
 * Messenger callback.
 *
 * FOUR CALLS:
 *   1. Code → short-lived user token
 *   2. Short-lived → long-lived. A Page token derived from a long-lived user
 *      token never expires; one derived from a short-lived token dies in an
 *      hour. Skipping this step produces a connection that silently stops.
 *   3. List the Pages, each with its own Page token
 *   4. Subscribe the Page so its messages reach our webhook
 *
 * If the owner administers several Pages we take the first. A Page picker is
 * the obvious next step, but it is a UI question rather than a plumbing one.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;

  const error = url.searchParams.get("error");
  if (error) {
    const denied = url.searchParams.get("error_reason") === "user_denied";
    return redirect(req, denied ? "cancelled" : "denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("oauth_state_messenger")?.value;

  if (!code || !state || !expected || state !== expected) {
    return redirect(req, "invalid_state");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return redirect(req, "not_configured");

  const origin = process.env.APP_URL ?? url.origin;
  const redirectUri = `${origin}/api/oauth/messenger/callback`;

  try {
    // 1. Code → short-lived user token.
    const shortRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        })
    );
    const shortBody = await shortRes.json();
    if (!shortRes.ok || !shortBody.access_token) {
      return detailed(req, shortBody?.error?.message ?? "code exchange failed");
    }

    // 2. Short-lived → long-lived, so the Page token never expires.
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortBody.access_token,
        })
    );
    const longBody = await longRes.json();
    const userToken: string = longBody?.access_token ?? shortBody.access_token;

    // 3. Which Pages does this person administer?
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const pagesBody = await pagesRes.json();
    const pages: { id: string; name: string; access_token: string }[] =
      pagesBody.data ?? [];

    if (!pages.length) return redirect(req, "no_pages");

    const page = pages[0];

    // 4. Subscribe the Page so its messages reach our webhook. Without this
    //    the connection looks fine and no message ever arrives.
    const subRes = await fetch(
      `${GRAPH}/${page.id}/subscribed_apps?` +
        new URLSearchParams({
          subscribed_fields: "messages,messaging_postbacks,message_echoes",
        }),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${page.access_token}` },
      }
    );
    if (!subRes.ok) {
      const b = await subRes.json().catch(() => ({}));
      return detailed(
        req,
        b?.error?.message ?? "could not subscribe the Page to messages"
      );
    }

    await saveSocialChannel({
      provider: "messenger",
      externalId: page.id, // webhooks arrive keyed on the Page id
      pageId: page.id, // and the Page is the sender
      displayName: page.name,
      accessToken: page.access_token,
      // Page tokens from a long-lived user token do not expire.
    });

    const res = redirect(req, "connected");
    res.cookies.delete("oauth_state_messenger");
    return res;
  } catch {
    return redirect(req, "error");
  }
}

function redirect(req: NextRequest, result: string) {
  return NextResponse.redirect(
    new URL(`/channels?result=${result}&provider=messenger`, req.nextUrl)
  );
}

function detailed(req: NextRequest, why: string) {
  return NextResponse.redirect(
    new URL(
      `/channels?result=exchange_failed&provider=messenger&detail=${encodeURIComponent(
        why.slice(0, 160)
      )}`,
      req.nextUrl
    )
  );
}

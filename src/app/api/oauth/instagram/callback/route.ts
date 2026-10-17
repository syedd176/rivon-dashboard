import { NextRequest, NextResponse } from "next/server";
import { saveSocialChannel } from "@/lib/channels-store";

/**
 * Step 2 of connecting Instagram: Facebook sends the owner back with a code.
 *
 * FIVE CALLS, IN ORDER:
 *   1. Exchange the code for a short-lived user token
 *   2. Exchange that for a LONG-LIVED user token — this matters, because a
 *      Page token derived from a short-lived one expires in an hour, while
 *      one derived from a long-lived token does not expire at all
 *   3. List the user's Pages, with their Page tokens
 *   4. Find which Page has a linked Instagram professional account
 *   5. Subscribe that Page to webhooks so messages reach us
 *
 * The commonest failure is step 4 finding nothing: the tenant's Instagram is
 * a personal account, or is not linked to a Page. We say which, rather than
 * reporting a generic failure.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;

  const error = url.searchParams.get("error");
  if (error) {
    const reason =
      url.searchParams.get("error_reason") === "user_denied"
        ? "cancelled"
        : "denied";
    return redirect(req, reason);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("oauth_state_instagram")?.value;

  if (!code || !state || !expected || state !== expected) {
    return redirect(req, "invalid_state");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return redirect(req, "not_configured");

  const origin = process.env.APP_URL ?? url.origin;
  const redirectUri = `${origin}/api/oauth/instagram/callback`;

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
      return redirect(req, "exchange_failed");
    }

    // 2. Short-lived → long-lived. Without this the Page token expires in
    //    an hour and the tenant silently stops receiving messages.
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
    const userToken: string = longBody.access_token ?? shortBody.access_token;

    // 3. Which Pages does this person administer?
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const pagesBody = await pagesRes.json();
    const pages: { id: string; name: string; access_token: string }[] =
      pagesBody.data ?? [];

    if (!pages.length) return redirect(req, "no_pages");

    // 4. Which of them has an Instagram professional account attached?
    for (const page of pages) {
      // Two fields, because Meta links accounts two ways and only one of
      // them is `instagram_business_account`. Checking just that one reports
      // "no Instagram found" for accounts that are in fact connected.
      const igRes = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}`,
        { headers: { Authorization: `Bearer ${page.access_token}` } }
      );
      const igBody = await igRes.json();
      const ig =
        igBody.instagram_business_account ??
        igBody.connected_instagram_account;
      if (!ig?.id) continue;

      // 5. Subscribe the Page so Instagram messages reach our webhook.
      await fetch(
        `${GRAPH}/${page.id}/subscribed_apps?` +
          new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks" }),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${page.access_token}` },
        }
      );

      await saveSocialChannel({
        provider: "instagram",
        externalId: ig.id, // routes inbound Instagram webhooks
        pageId: page.id,
        displayName: ig.username ? `@${ig.username}` : page.name,
        accessToken: page.access_token,
      });

      const res = redirect(req, "connected");
      res.cookies.delete("oauth_state_instagram");
      return res;
    }

    // Pages exist, but none has a professional Instagram account linked.
    return redirect(req, "no_instagram");
  } catch {
    return redirect(req, "error");
  }
}

function redirect(req: NextRequest, result: string) {
  return NextResponse.redirect(
    new URL(`/channels?result=${result}&provider=instagram`, req.nextUrl)
  );
}

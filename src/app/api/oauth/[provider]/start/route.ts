import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Step 1 of connecting a channel: send the owner to Meta to authorise us.
 *
 * THE REAL FLOW (not yet wired — see TODOs):
 *   1. Owner clicks Connect  →  lands here
 *   2. We build Meta's authorise URL with our app id and the scopes we need
 *   3. Owner logs in, picks which account/number to grant
 *   4. Meta redirects to /api/oauth/{provider}/callback with a short-lived code
 *   5. The callback exchanges that code for a token, server-side
 *
 * The app secret never reaches the browser. That is the whole reason this
 * runs on the server rather than in the page.
 */

const SCOPES: Record<string, string[]> = {
  whatsapp: [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "business_management",
  ],
  instagram: [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_manage_metadata",
    "pages_show_list",
  ],
  messenger: [
    "pages_messaging",
    "pages_manage_metadata",
    "pages_show_list",
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (provider === "widget") {
    // The widget needs no OAuth — the embed key is issued by us.
    return NextResponse.redirect(new URL("/channels?error=widget_no_oauth", req.url));
  }

  const scopes = SCOPES[provider];
  if (!scopes) {
    return NextResponse.redirect(
      new URL(`/channels?error=unknown_provider`, req.url)
    );
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    // Expected until the Meta app exists. Fail visibly rather than silently.
    return NextResponse.redirect(
      new URL(`/channels?error=not_configured&provider=${provider}`, req.url)
    );
  }

  // CSRF protection: a random value we check again on the callback.
  // TODO: persist this against the session rather than a cookie alone.
  const state = randomBytes(16).toString("hex");

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/${provider}/callback`;

  const authorise = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authorise.searchParams.set("client_id", appId);
  authorise.searchParams.set("redirect_uri", redirectUri);
  authorise.searchParams.set("scope", scopes.join(","));
  authorise.searchParams.set("state", state);
  authorise.searchParams.set("response_type", "code");

  const res = NextResponse.redirect(authorise);
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

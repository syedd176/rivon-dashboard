import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Instagram Login — the low-friction way to connect Instagram.
 *
 * WHY THIS EXISTS alongside the Facebook Login route:
 *
 * Facebook Login requires the tenant to have a Facebook Page, link their
 * Instagram to it through Account Centre, AND turn on Connected Tools. Three
 * prerequisites, any of which fails five screens into the flow with no useful
 * explanation. A cleaner or pest controller will abandon at that point.
 *
 * Instagram Login needs only a professional Instagram account. No Page, no
 * linking. Two screens.
 *
 * THE TRADE, and it is real: these tokens expire after 60 DAYS and must be
 * refreshed. A Facebook Page token never expires. Something has to refresh
 * them on a schedule, or tenants go silently dark after two months.
 *
 * Also note this route cannot serve Messenger — that still needs a Page.
 */

// Matches the Embed URL Meta generates for this app, exactly. Requesting a
// subset can fail validation, so the list mirrors what the dashboard expects.
// content_publish and manage_insights are unused by the code today; drop them
// from both here and the app config before App Review.
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

export async function GET(req: NextRequest) {
  // The Instagram app id is separate from the Meta app id, and is shown on
  // the "API setup with Instagram login" page in the App Dashboard.
  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/channels?result=not_configured&provider=instagram", req.url)
    );
  }

  const state = randomBytes(16).toString("hex");
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/oauth/instagram-direct/callback`;

  const authorise = new URL("https://www.instagram.com/oauth/authorize");
  authorise.searchParams.set("client_id", appId);
  authorise.searchParams.set("redirect_uri", redirectUri);
  authorise.searchParams.set("response_type", "code");
  authorise.searchParams.set("scope", SCOPES.join(","));
  authorise.searchParams.set("state", state);
  // Meta's generated embed URL sets this; it makes the owner pick the
  // Instagram account explicitly rather than silently reusing a session.
  authorise.searchParams.set("force_reauth", "true");

  const res = NextResponse.redirect(authorise);
  res.cookies.set("oauth_state_ig_direct", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

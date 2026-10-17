import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Step 1 of connecting Instagram: send the owner to Facebook to authorise us.
 *
 * Simpler than WhatsApp — a standard OAuth redirect, not an eight-screen
 * popup. No Tech Provider status, no phone number, no WABA.
 *
 * What we are actually after is a FACEBOOK PAGE. Instagram direct messages
 * are reached through the Page the professional account is linked to, so the
 * flow grants us Page access and we find the Instagram account behind it.
 *
 * PREREQUISITES THE TENANT MUST MEET — and we cannot remove these, only
 * explain them well:
 *   - Their Instagram must be a Professional (Business or Creator) account
 *   - It must be linked to a Facebook Page they administer
 *   - In Instagram: Settings → Message controls → Connected Tools →
 *     "Allow Access to Messages" must be ON
 */

const SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "pages_show_list",
  "pages_read_engagement",
];

export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/channels?result=not_configured&provider=instagram", req.url)
    );
  }

  // CSRF protection: a random value checked again on the callback.
  const state = randomBytes(16).toString("hex");

  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/oauth/instagram/callback`;

  const authorise = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authorise.searchParams.set("client_id", appId);
  authorise.searchParams.set("redirect_uri", redirectUri);
  authorise.searchParams.set("scope", SCOPES.join(","));
  authorise.searchParams.set("state", state);
  authorise.searchParams.set("response_type", "code");

  const res = NextResponse.redirect(authorise);
  res.cookies.set("oauth_state_instagram", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

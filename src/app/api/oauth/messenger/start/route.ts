import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Connect Facebook Messenger.
 *
 * Simpler than either Instagram route: Messenger IS a Facebook Page product,
 * so there is no linked-account step and no Instagram-style indirection. The
 * owner grants access to a Page, and the Page token is what sends messages.
 *
 * The one prerequisite we cannot remove: they must administer a Facebook
 * Page. A business with no Page has nothing to connect.
 *
 * Unlike Instagram Login, Page tokens derived from a long-lived user token
 * do not expire — so no refresh cron is needed for this channel.
 */

/**
 * Facebook Login for Business does not accept a loose `scope` list the way
 * plain Facebook Login does. It requires a CONFIGURATION — created in the
 * dashboard, holding the permission set and the asset type — passed as
 * config_id. Sending scopes instead produces "This app needs at least one
 * supported permission", which reads like a bad scope name but means the
 * dialog was never configured.
 *
 * The configuration must request: pages_messaging, pages_show_list,
 * pages_manage_metadata, over the Pages asset type.
 *
 * `scope` is kept as a fallback for an app still on plain Facebook Login.
 */
const SCOPES = [
  "pages_messaging", // send and receive messages as the Page
  "pages_show_list", // list which Pages the owner administers
  // Subscribes the Page to our webhook in the callback. Without it that POST
  // fails, the connection looks fine, and no message ever arrives.
  "pages_manage_metadata",
];

export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/channels?result=not_configured&provider=messenger", req.url)
    );
  }

  const state = randomBytes(16).toString("hex");
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/oauth/messenger/callback`;

  const authorise = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authorise.searchParams.set("client_id", appId);
  authorise.searchParams.set("redirect_uri", redirectUri);
  authorise.searchParams.set("state", state);
  authorise.searchParams.set("response_type", "code");

  const configId = process.env.MESSENGER_CONFIG_ID;
  if (configId) {
    authorise.searchParams.set("config_id", configId);
    // The configuration already names the permissions; sending scope too
    // makes Meta reject the dialog.
  } else {
    authorise.searchParams.set("scope", SCOPES.join(","));
  }

  const res = NextResponse.redirect(authorise);
  res.cookies.set("oauth_state_messenger", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

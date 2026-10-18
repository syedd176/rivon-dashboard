import { NextRequest, NextResponse } from "next/server";
import { getSocialCredentials } from "@/lib/channels-store";

/**
 * Reply on Instagram or Messenger.
 *
 * Different from WhatsApp in three ways worth knowing:
 *   - sent through the PAGE, not the Instagram account
 *   - the recipient is an opaque scoped id, not a phone number
 *   - the window is 24 hours from the customer's last message, same idea
 *     but enforced by a different rule set
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export async function POST(req: NextRequest) {
  const { to, text, provider, accountId } = (await req.json()) as {
    to?: string;
    text?: string;
    provider?: "instagram" | "messenger";
    accountId?: string;
  };

  if (!to || !text) {
    return NextResponse.json(
      { error: "Both a recipient and a message are required." },
      { status: 400 }
    );
  }

  const channel = provider ?? "instagram";
  const creds = await getSocialCredentials(channel, accountId);

  if (!creds) {
    return NextResponse.json(
      {
        error: `No connected ${channel} account. Connect one on the Channels page.`,
      },
      { status: 503 }
    );
  }

  // Instagram Login sends through graph.instagram.com against the account
  // itself; Facebook Login sends through graph.facebook.com via the Page.
  const endpoint = creds.isDirect
    ? `https://graph.instagram.com/v23.0/${creds.pageId}/messages`
    : `${GRAPH}/${creds.pageId}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text },
        ...(creds.isDirect ? {} : { messaging_type: "RESPONSE" }),
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      const message: string =
        body?.error?.message ?? "The message could not be sent.";
      // Code 10 covers BOTH the closed 24-hour window and development-mode
      // gating, and the two call for opposite actions — wait for the
      // customer to write again, versus add a tester or ship the review.
      // Meta distinguishes them only in the message text, so read it.
      const devMode = message.includes("not admins, developers or testers");
      const hint =
        body?.error?.code === 10 && !devMode
          ? " The 24-hour reply window for this conversation has closed."
          : body?.error?.code === 190
            ? " The access token is no longer valid. Reconnect the account."
            : "";
      return NextResponse.json(
        { error: message + hint, code: body?.error?.code },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, messageId: body?.message_id });
  } catch {
    return NextResponse.json(
      { error: "Could not reach Meta. Please try again." },
      { status: 502 }
    );
  }
}

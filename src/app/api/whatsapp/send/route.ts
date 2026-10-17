import { NextRequest, NextResponse } from "next/server";
import { getSendCredentials } from "@/lib/channels-store";

/**
 * Send one WhatsApp message through the Cloud API.
 *
 * This is the first real piece of the outbound dispatcher. Right now it sends
 * directly; the full version adds a dedupe key, per-tenant rate limits,
 * exponential backoff and a dead-letter queue — see TEAM_SCOPES.md §2.1.
 *
 * It also exists to satisfy App Review, which requires a video showing a
 * message leaving this app and arriving in WhatsApp.
 *
 * Credentials come from env for now. Once tenants connect their own numbers
 * through Embedded Signup, the token and phone_number_id are read per tenant
 * from the `channels` table instead.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export async function POST(req: NextRequest) {
  const { to, text, fromPhoneNumberId } = (await req.json()) as {
    to?: string;
    text?: string;
    /** Which connected number to send from. Defaults to the most recent. */
    fromPhoneNumberId?: string;
  };

  if (!to || !text) {
    return NextResponse.json(
      { error: "Both a phone number and a message are required." },
      { status: 400 }
    );
  }

  // Prefer a channel connected through Embedded Signup: its system-user
  // token never expires. Falls back to the env test number.
  const creds = await getSendCredentials(fromPhoneNumberId);

  if (!creds) {
    return NextResponse.json(
      {
        error:
          "No connected WhatsApp number. Connect one on the Channels page, or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
      },
      { status: 503 }
    );
  }
  const { phoneNumberId, accessToken: token } = creds;

  // Meta wants digits only — no spaces, no plus, no dashes.
  const recipient = to.replace(/[^\d]/g, "");

  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      // Meta's errors are specific and worth surfacing as-is — they say
      // things like "recipient not in allowed list" that tell you the fix.
      const message: string =
        body?.error?.message ?? "WhatsApp rejected the message.";
      const hint =
        body?.error?.code === 131_030
          ? " This number is not in the test number's allowed recipients. Add and verify it on the API Setup page."
          : body?.error?.code === 190
            ? " The access token has expired. Temporary tokens last 24 hours — get a fresh one from API Setup."
            : "";
      return NextResponse.json(
        { error: message + hint, code: body?.error?.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: body?.messages?.[0]?.id,
      to: recipient,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach WhatsApp. Check your connection and retry." },
      { status: 502 }
    );
  }
}

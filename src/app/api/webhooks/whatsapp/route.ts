import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  extractMessages,
  extractStatuses,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp-types";
import {
  extractMessagingMessages,
  type MessagingWebhookBody,
} from "@/lib/instagram-types";
import {
  extractComments,
  type CommentWebhookBody,
} from "@/lib/comment-types";
import { recordInbound, recordStatus } from "@/lib/inbox";

/**
 * Inbound WhatsApp webhook.
 *
 * THE RULE THIS PATH OBEYS (SYSTEM_DESIGN.md §5.1):
 *   verify signature → persist raw → enqueue → return 200. Nothing else.
 *
 * No LLM call, no database join, no business logic here. WhatsApp retries if
 * we do not respond within seconds, and a slowly-processed webhook becomes a
 * DUPLICATE REPLY to a real customer. Target is under 200ms.
 *
 * Right now "persist and enqueue" is an in-memory store so the path can be
 * proven end to end. When the backend exists this becomes: insert into
 * `messages` with a unique (tenant_id, provider_message_id), then publish to
 * the `inbound` Celery queue.
 */


// ---------------------------------------------------------------- GET
// Meta calls this once when you register the webhook URL. It echoes back a
// challenge to prove you own the endpoint.

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    return new NextResponse("Webhook verify token not configured", {
      status: 503,
    });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    // Must be the bare challenge string, not JSON.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Verification failed", { status: 403 });
}

// ---------------------------------------------------------------- POST

export async function POST(req: NextRequest) {
  // Read the body as text, not JSON — the signature is over the exact bytes.
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    // Anyone can POST here. Without this check they could inject fake
    // customer messages into a tenant's conversation.
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WhatsAppWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    // Malformed, but still acknowledge — retrying will not fix bad JSON.
    return NextResponse.json({ ok: true });
  }

  try {
    // Instagram and Messenger use a different payload shape, and arrive on
    // the same endpoint. Route on `object` rather than running both parsers.
    if (body.object === "instagram" || body.object === "page") {
      // One Instagram payload carries either messaging events or comment
      // changes, never both. Run whichever is present.
      for (const message of extractMessagingMessages(
        body as MessagingWebhookBody
      )) {
        await recordInbound(message);
      }
      for (const comment of extractComments(body as CommentWebhookBody)) {
        await recordInbound(comment);
      }
      return NextResponse.json({ ok: true });
    }

    for (const message of extractMessages(body)) {
      // TODO: resolve providerPhoneNumberId → tenant_id. Getting this wrong
      // sends one business's customers to another business's agent.
      await recordInbound(message);
    }

    for (const status of extractStatuses(body)) {
      await recordStatus(status);
    }
  } catch (err) {
    // Never let a processing fault turn into a 500 — Meta would retry, and
    // we would handle the same message twice. Record it and move on.
    console.error("webhook processing error", err);
  }

  // Always 200, always fast.
  return NextResponse.json({ ok: true });
}

/**
 * Meta signs every webhook with the app secret.
 *
 * Compared in constant time: a plain === leaks timing information that can be
 * used to forge a signature byte by byte.
 */
function verifySignature(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;

  if (!secret) {
    // Fail closed. An unverified webhook is an open door.
    console.error("META_APP_SECRET is not set — rejecting webhook");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const received = header.slice("sha256=".length);

  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

import { NextRequest, NextResponse } from "next/server";
import { saveChannel } from "@/lib/channels-store";

/**
 * Server-side completion of WhatsApp Embedded Signup.
 *
 * The browser sends us the short-lived `code` plus the ids the owner picked.
 * Everything from here runs server-side because it needs the app secret.
 *
 * FOUR CALLS TO META, IN ORDER:
 *   1. Exchange the code for a customer-scoped business token
 *   2. Register the phone number for Cloud API use
 *   3. Subscribe our app to webhooks on their WABA
 *   4. Read the display name back, to show the owner what connected
 *
 * Then persist, encrypted, against this tenant. That row is what every
 * inbound webhook is resolved against:
 *
 *     channels(tenant_id, provider, provider_phone_number_id, waba_id,
 *              business_id, encrypted_token, status, last_health_check)
 *
 * `provider_phone_number_id → tenant_id` is the routing key. If it is wrong,
 * one business's customers reach another business's agent.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

interface ExchangeBody {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}

export async function POST(req: NextRequest) {
  const { code, waba_id, phone_number_id, business_id } =
    (await req.json()) as ExchangeBody;

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  if (!waba_id || !phone_number_id) {
    // The window message either did not arrive or arrived without ids.
    return NextResponse.json(
      { error: "Signup did not return a WhatsApp account and number" },
      { status: 400 }
    );
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Server is not configured for WhatsApp yet" },
      { status: 503 }
    );
  }

  try {
    // 1. Code → business token.
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          code,
        }),
      { method: "GET" }
    );
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.access_token) {
      // The commonest cause by far: the code expired. It lives 30 seconds.
      return NextResponse.json(
        {
          error:
            tokenBody?.error?.message ??
            "Could not complete setup. Please try connecting again.",
        },
        { status: 400 }
      );
    }
    const accessToken: string = tokenBody.access_token;

    // 2. Register the number for Cloud API. The PIN is the two-step
    //    verification code for this number; we generate and store it.
    //    TODO: generate per tenant and persist, do not hardcode.
    const pin = process.env.WHATSAPP_REGISTER_PIN ?? "000000";
    const regRes = await fetch(`${GRAPH}/${phone_number_id}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    if (!regRes.ok) {
      const b = await regRes.json().catch(() => ({}));
      // Already-registered is fine — the owner may be reconnecting.
      const alreadyRegistered = b?.error?.code === 133_005;
      if (!alreadyRegistered) {
        return NextResponse.json(
          { error: b?.error?.message ?? "Could not register the number" },
          { status: 400 }
        );
      }
    }

    // 3. Subscribe to webhooks on their WABA so messages reach us.
    const subRes = await fetch(`${GRAPH}/${waba_id}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!subRes.ok) {
      const b = await subRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: b?.error?.message ?? "Could not subscribe to messages" },
        { status: 400 }
      );
    }

    // 4. Read back the display number, so the owner sees what connected.
    let displayNumber = "";
    const infoRes = await fetch(
      `${GRAPH}/${phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (infoRes.ok) {
      const info = await infoRes.json();
      displayNumber = info.display_phone_number ?? "";
    }

    // Persist so the dashboard can send on this number later. The token is
    // never returned to the browser and never logged.
    // TODO: encrypt at rest, and scope by tenant_id, before a second tenant.
    await saveChannel({
      providerPhoneNumberId: phone_number_id,
      wabaId: waba_id,
      businessId: business_id,
      displayNumber: displayNumber || undefined,
      accessToken,
    });

    return NextResponse.json({
      ok: true,
      display_number: displayNumber,
      waba_id,
      phone_number_id,
      business_id,
      persisted: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong talking to WhatsApp. Please try again." },
      { status: 502 }
    );
  }
}

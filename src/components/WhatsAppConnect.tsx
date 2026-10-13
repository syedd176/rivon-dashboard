"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WhatsApp Embedded Signup — the flow ManyChat and every other WhatsApp
 * platform uses to let a business connect its own number.
 *
 * WHAT THE OWNER SEES (Meta's popup, 8 screens, ~5 minutes):
 *   1. Log in with Facebook / Meta Business credentials
 *   2. Accept terms (Cloud API, WhatsApp Business, Meta Business Tools)
 *   3. Choose which WhatsApp APIs to enable
 *   4. Grant our app access to their WhatsApp assets
 *   5. Pick or create a business portfolio
 *   6. Pick or create a WhatsApp Business Account (WABA)
 *   7. Enter and verify their phone number
 *   8. Set the display name customers will see
 *
 * WHAT WE GET BACK — two things, from two different places:
 *   - FB.login callback  → an exchangeable `code` (expires in 30 SECONDS)
 *   - window message     → waba_id, phone_number_id, business_id
 *
 * Both are needed. The code alone does not tell us which number was chosen;
 * the message alone cannot be exchanged for a token. We collect both and post
 * them together.
 *
 * PREREQUISITES before this works at all:
 *   - A Business-type Meta app with App Review passed for
 *     whatsapp_business_management and whatsapp_business_messaging
 *   - A Facebook Login for Business configuration using the
 *     "WhatsApp Embedded Signup" variation → gives us the config_id
 *   - Our domain added to Allowed Domains and Valid OAuth Redirect URIs
 *   - Tech Provider or Solution Partner status
 *   - Default onboarding cap is 10 new customers per rolling 7 days;
 *     Business Verification + App Review + Access Verification raises it to 200
 */

const GRAPH_VERSION = "v25.0";

type Phase =
  | "idle"
  | "loading-sdk"
  | "in-popup"
  | "exchanging"
  | "connected"
  | "cancelled"
  | "error";

interface SignupPayload {
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (res: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export function WhatsAppConnect({
  appId,
  configId,
}: {
  appId?: string;
  configId?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<string>("");
  const [sdkReady, setSdkReady] = useState(false);

  /**
   * The signup payload arrives via window message, the code via the FB.login
   * callback — and the order is not guaranteed. Hold the payload in a ref so
   * whichever lands second can post both together.
   */
  const payloadRef = useRef<SignupPayload | null>(null);

  // Load Meta's JavaScript SDK once.
  useEffect(() => {
    if (!appId || window.FB) {
      if (window.FB) setSdkReady(true);
      return;
    }
    setPhase("loading-sdk");

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: GRAPH_VERSION,
      });
      setSdkReady(true);
      setPhase("idle");
    };

    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    document.body.appendChild(s);
  }, [appId]);

  // Listen for the popup telling us which assets the owner picked.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only trust messages from Meta.
      if (!event.origin.endsWith("facebook.com")) return;

      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // not ours
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "CANCEL") {
        setPhase("cancelled");
        setDetail(
          data.data?.current_step
            ? `Stopped at: ${data.data.current_step}`
            : "The owner closed the window before finishing."
        );
        return;
      }

      if (data.event === "ERROR") {
        setPhase("error");
        // Keep error_code, session_id and timestamp — Meta support asks for them.
        setDetail(
          `${data.data?.error_message ?? "Unknown error"} (code ${
            data.data?.error_code ?? "?"
          }, session ${data.data?.session_id ?? "?"})`
        );
        return;
      }

      // Any FINISH* event means success.
      if (data.event?.startsWith("FINISH")) {
        payloadRef.current = {
          waba_id: data.data?.waba_id,
          phone_number_id: data.data?.phone_number_id,
          business_id: data.data?.business_id,
        };
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function finish(code: string) {
    setPhase("exchanging");
    try {
      const res = await fetch("/api/oauth/whatsapp/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...payloadRef.current }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Exchange failed");
      setPhase("connected");
      setDetail(body.display_number ?? "");
    } catch (e) {
      setPhase("error");
      setDetail(e instanceof Error ? e.message : "Could not complete setup.");
    }
  }

  function launch() {
    if (!window.FB || !configId) return;
    setPhase("in-popup");
    payloadRef.current = null;

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          // No code and no CANCEL message means the popup was blocked or closed.
          setPhase((p) => (p === "in-popup" ? "cancelled" : p));
          return;
        }
        // The code expires in 30 seconds — exchange immediately.
        void finish(code);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      }
    );
  }

  const notConfigured = !appId || !configId;

  // Before Rivon's own Meta app exists there is nothing for the button to
  // point at. Show a disabled button so the row keeps its shape — the
  // explanation of why belongs in the row body, not in this narrow column.
  if (notConfigured) {
    return (
      <button
        disabled
        title="Rivon's Meta app is not set up yet"
        className="cursor-not-allowed rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-500"
      >
        Connect
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={launch}
        disabled={!sdkReady || phase === "in-popup" || phase === "exchanging"}
        className="rounded-md bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
      >
        {phase === "loading-sdk" && "Loading…"}
        {phase === "in-popup" && "Waiting for Facebook…"}
        {phase === "exchanging" && "Finishing setup…"}
        {(phase === "idle" || phase === "cancelled" || phase === "error") &&
          "Connect WhatsApp"}
        {phase === "connected" && "Connected"}
      </button>

      {phase === "cancelled" && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Setup was not finished. {detail} You can start again whenever you are
          ready.
        </p>
      )}
      {phase === "error" && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400">{detail}</p>
      )}
      {phase === "connected" && (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          WhatsApp connected{detail ? ` — ${detail}` : ""}. Your agent will
          answer messages sent to this number.
        </p>
      )}
    </div>
  );
}

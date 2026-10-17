"use client";

import { useState } from "react";

/**
 * Reply to an inbound message from the dashboard.
 *
 * Free-form replies are allowed inside the 24-hour customer service window,
 * which opens when a customer messages the business. No template, no payment
 * method — that is only needed for business-initiated messages outside the
 * window.
 *
 * This is the manual half of what the agent will do automatically. It also
 * doubles as the human-handoff path from SYSTEM_DESIGN.md §4.4: staff takes
 * over a live conversation and types the reply themselves.
 */

export function ReplyBox({
  to,
  senderName,
  windowOpen,
  provider = "whatsapp",
  accountId,
}: {
  to: string;
  senderName?: string;
  windowOpen: boolean;
  provider?: "whatsapp" | "instagram" | "messenger";
  accountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [problem, setProblem] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setState("sending");
    try {
      // Each channel has its own send endpoint — different API shapes.
      const endpoint =
        provider === "whatsapp" ? "/api/whatsapp/send" : "/api/instagram/send";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text, provider, accountId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Send failed");
      setState("sent");
      setText("");
      setTimeout(() => {
        setState("idle");
        setOpen(false);
      }, 2000);
    } catch (err) {
      setState("error");
      setProblem(err instanceof Error ? err.message : "Send failed");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Reply
      </button>
    );
  }

  return (
    <form onSubmit={send} className="mt-3">
      {!windowOpen && (
        <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          The 24-hour reply window for this conversation has closed. A free-form
          reply will be rejected — reaching them now needs an approved template.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        autoFocus
        placeholder={`Reply to ${senderName ?? "+" + to}…`}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={state === "sending" || !text.trim()}
          className="rounded-md bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send reply"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setState("idle");
          }}
          className="text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          Cancel
        </button>

        {state === "sent" && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Sent
          </span>
        )}
      </div>

      {state === "error" && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">{problem}</p>
      )}
    </form>
  );
}

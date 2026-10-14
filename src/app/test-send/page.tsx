"use client";

import { useState } from "react";

/**
 * Send a test WhatsApp message.
 *
 * Two jobs: it is the first working slice of the outbound dispatcher, and it
 * is what App Review's video requirement needs — a reviewer must see a message
 * leave this app and arrive in WhatsApp.
 *
 * Laid out so it reads clearly in a screen recording: large type, one obvious
 * action, and a result that is unambiguous at a glance.
 */

type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent"; id?: string }
  | { phase: "error"; message: string };

export default function TestSendPage() {
  const [to, setTo] = useState("");
  const [text, setText] = useState("Hello from Rivon.");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "sending" });
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Send failed");
      setState({ phase: "sent", id: body.messageId });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-14">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400">
        Rivon
      </p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900 dark:text-slate-50">
        Send a WhatsApp message
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Sends through the WhatsApp Cloud API from this application.
      </p>

      <form
        onSubmit={send}
        className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Recipient number
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="447700900123"
            required
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-lg text-slate-900 outline-none focus:border-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            Country code first, no plus or spaces.
          </span>
        </label>

        <label className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Message
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            required
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-lg text-slate-900 outline-none focus:border-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <button
          type="submit"
          disabled={state.phase === "sending"}
          className="mt-6 w-full rounded-md bg-[#25D366] px-5 py-3 text-base font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {state.phase === "sending" ? "Sending…" : "Send message"}
        </button>

        {state.phase === "sent" && (
          <div className="mt-5 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              Message sent
            </p>
            {state.id && (
              <p className="mt-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                {state.id}
              </p>
            )}
          </div>
        )}

        {state.phase === "error" && (
          <div className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {state.message}
            </p>
          </div>
        )}
      </form>
    </main>
  );
}

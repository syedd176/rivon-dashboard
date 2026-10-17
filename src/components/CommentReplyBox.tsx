"use client";

import { useState } from "react";

/**
 * Reply to an Instagram comment: publicly, then privately.
 *
 * Two fields because they do different jobs. The public one is seen by
 * everybody who reads the post, so it stays short and says nothing specific.
 * The private one is where the real conversation starts — and sending it
 * opens the 24-hour window, so the agent can keep talking afterwards.
 */

const DEFAULT_PUBLIC = "Thanks for getting in touch — I've sent you a message.";
const DEFAULT_PRIVATE =
  "Hi! Thanks for your comment. What can we help you with?";

export function CommentReplyBox({
  commentId,
  senderName,
  accountId,
}: {
  commentId: string;
  senderName?: string;
  accountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [publicReply, setPublicReply] = useState(DEFAULT_PUBLIC);
  const [privateMessage, setPrivateMessage] = useState(DEFAULT_PRIVATE);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );
  const [note, setNote] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setNote("");
    try {
      const res = await fetch("/api/instagram/comment-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          publicReply,
          privateMessage: privateMessage.trim() || undefined,
          accountId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Reply failed");

      setState("done");
      setNote(
        body.privateSent
          ? "Replied publicly and sent a private message."
          : body.privateProblem
            ? `Public reply posted. ${body.privateProblem}`
            : "Public reply posted."
      );
      setTimeout(() => {
        setState("idle");
        setOpen(false);
      }, 3500);
    } catch (err) {
      setState("error");
      setNote(err instanceof Error ? err.message : "Reply failed");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-pink-300 px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-50 dark:border-pink-900 dark:text-pink-400 dark:hover:bg-pink-950/40"
      >
        Reply to comment
      </button>
    );
  }

  return (
    <form onSubmit={send} className="mt-3 space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Public reply
          <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
            everyone who sees the post sees this
          </span>
        </label>
        <input
          value={publicReply}
          onChange={(e) => setPublicReply(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pink-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Private message
          <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
            only {senderName ?? "they"} sees this, and it opens the reply window
          </span>
        </label>
        <textarea
          value={privateMessage}
          onChange={(e) => setPrivateMessage(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pink-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={state === "sending" || !publicReply.trim()}
          className="rounded-md bg-[#E1306C] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send both"}
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
      </div>

      {note && (
        <p
          className={`text-xs ${
            state === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {note}
        </p>
      )}
    </form>
  );
}

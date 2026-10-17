"use client";

import { useEffect, useState } from "react";
import type { NormalisedMessage, MessageStatus } from "@/lib/whatsapp-types";
import { ReplyBox } from "@/components/ReplyBox";

/**
 * Live view of messages arriving on the webhook.
 *
 * A development tool, not a product screen — it proves the inbound path works
 * before there is a database or an agent. The real conversation viewer is
 * Team B's, and reads from Postgres.
 */

interface Inbox {
  messages: NormalisedMessage[];
  statuses: MessageStatus[];
}

export default function InboxPage() {
  const [inbox, setInbox] = useState<Inbox>({ messages: [], statuses: [] });
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        if (!alive) return;
        setInbox(await res.json());
        setConnected(true);
      } catch {
        if (alive) setConnected(false);
      }
    }

    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400">
            Development
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900 dark:text-slate-50">
            Inbound messages
          </h1>
        </div>
        <span
          className={`text-xs font-medium ${
            connected
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {connected ? "● watching" : "● disconnected"}
        </span>
      </div>

      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Messages sent to a connected WhatsApp number appear here within a couple
        of seconds. Refreshes automatically.
      </p>

      {inbox.messages.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400">
            Nothing yet. Send a WhatsApp message to the connected number and it
            will appear here.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {inbox.messages.map((m) => (
          <article
            key={m.providerMessageId}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {m.senderName ?? "Unknown"}{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  +{m.from}
                </span>
              </p>
              <p className="text-xs text-slate-400">
                {new Date(m.receivedAt).toLocaleTimeString()}
              </p>
            </div>

            <p className="mt-2 text-lg text-slate-800 dark:text-slate-200">
              {m.text}
            </p>

            <ReplyBox
              to={m.from}
              senderName={m.senderName}
              windowOpen={
                Date.now() - new Date(m.receivedAt).getTime() <
                24 * 60 * 60 * 1000
              }
            />

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <div>
                <dt className="inline font-medium">type </dt>
                <dd className="inline font-mono">{m.messageType}</dd>
              </div>
              <div>
                <dt className="inline font-medium">to number id </dt>
                <dd className="inline font-mono">{m.providerPhoneNumberId}</dd>
              </div>
              <div>
                <dt className="inline font-medium">id </dt>
                <dd className="inline font-mono">
                  {m.providerMessageId.slice(0, 24)}…
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {inbox.statuses.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Delivery receipts
          </h2>
          <ul className="mt-2 space-y-1">
            {inbox.statuses.slice(0, 10).map((s, i) => (
              <li
                key={`${s.id}-${i}`}
                className="font-mono text-xs text-slate-500 dark:text-slate-400"
              >
                {s.status} · +{s.recipient_id} · {s.id.slice(0, 20)}…
                {s.errors?.[0] && (
                  <span className="ml-2 text-red-600 dark:text-red-400">
                    {s.errors[0].title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        Stored in Postgres, append-only, deduplicated on provider message id.
        A first slice of the real messages table — tenant scoping and row-level
        security land when there is more than one tenant.
      </p>
    </main>
  );
}

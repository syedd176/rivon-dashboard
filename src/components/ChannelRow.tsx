"use client";

import { useState } from "react";
import {
  type Channel,
  PROVIDERS,
  relativeTime,
} from "@/lib/channels";
import { WhatsAppConnect } from "./WhatsAppConnect";

function StatusPill({ status }: { status: Channel["status"] }) {
  const map = {
    connected: { label: "Connected", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
    degraded: { label: "Needs attention", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    disconnected: { label: "Not connected", dot: "bg-slate-400", text: "text-slate-500 dark:text-slate-400" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${map.text}`}>
      <span className={`h-2 w-2 rounded-full ${map.dot}`} aria-hidden />
      {map.label}
    </span>
  );
}

function ProviderIcon({ color, letter }: { color: string; letter: string }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {letter}
    </div>
  );
}

export function ChannelRow({ channel }: { channel: Channel }) {
  const meta = PROVIDERS[channel.provider];
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Meta channels cannot be connected until Rivon's own Meta app exists.
  // The widget needs no such thing, which is why it always works.
  // Instagram and Messenger use a plain OAuth redirect, so they only need
  // the app id. WhatsApp additionally needs the Embedded Signup config.
  const needsPlatformSetup =
    channel.provider !== "widget" && !process.env.NEXT_PUBLIC_META_APP_ID;

  const embedSnippet = channel.embedKey
    ? `<script src="https://cdn.rivon.ai/widget.js" data-key="${channel.embedKey}" async></script>`
    : "";

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the snippet is selectable as a fallback.
    }
  }

  function connect() {
    setBusy(true);
    // Instagram uses Instagram Login rather than Facebook Login: no Page
    // required, no Account Centre linking, two screens instead of five.
    // Instagram uses Instagram Login (no Page needed); Messenger has its own
    // route because it is a Page product and needs different scopes.
    const route =
      channel.provider === "instagram" ? "instagram-direct" : channel.provider;
    window.location.href = `/api/oauth/${route}/start`;
  }

  return (
    <div className="border-b border-slate-200 px-5 py-4 last:border-0 dark:border-slate-800">
      <div className="flex flex-wrap items-start gap-4">
        <ProviderIcon color={meta.accent} letter={meta.name[0]} />

        {/* basis-64 stops this column collapsing to one word per line when the
            action column grows; it wraps below instead. */}
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {meta.name}
            </h3>
            <StatusPill status={channel.status} />
          </div>

          {channel.status === "disconnected" ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {meta.tagline}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium">{channel.identifier}</span>
              <span className="text-slate-400 dark:text-slate-500">
                {" · last message "}
                {relativeTime(channel.lastActivityMinutesAgo)}
              </span>
            </p>
          )}

          {channel.status === "degraded" && channel.problem && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              {channel.problem}
            </div>
          )}

          {channel.status === "disconnected" && meta.requirement && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Before you start:</span>{" "}
              {meta.requirement}
            </p>
          )}

          {channel.status === "disconnected" && needsPlatformSetup && (
            <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Setup needed by Rivon, not by you.
              </span>{" "}
              Connecting runs through Rivon&apos;s own Meta app, which has to be
              created and reviewed once before any business can connect. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_META_APP_ID</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_META_CONFIG_ID</code> to
              enable this button.
            </div>
          )}

          {channel.provider === "widget" && channel.embedKey && (
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Paste this into your site, just before &lt;/body&gt;
              </label>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 overflow-x-auto rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {embedSnippet}
                </code>
                <button
                  onClick={copyEmbed}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {channel.status === "disconnected" &&
            (channel.provider === "whatsapp" ? (
              // WhatsApp uses Meta's Embedded Signup popup, not a redirect.
              <WhatsAppConnect
                appId={process.env.NEXT_PUBLIC_META_APP_ID}
                configId={process.env.NEXT_PUBLIC_META_CONFIG_ID}
              />
            ) : (
              <button
                onClick={connect}
                disabled={busy}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {busy ? "Opening…" : "Connect"}
              </button>
            ))}
          {channel.status === "degraded" && (
            <button
              onClick={connect}
              disabled={busy}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Reconnect
            </button>
          )}
          {channel.status === "connected" && channel.provider !== "widget" && (
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

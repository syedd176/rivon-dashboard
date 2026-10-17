"use client";

import { useSearchParams } from "next/navigation";

/**
 * Shows why a channel connection failed.
 *
 * Client-side so the channels page stays static — reading the query string on
 * the server would make the whole page dynamic for the sake of one banner.
 *
 * The point is that a failure says something the owner can act on. "Could not
 * complete the connection" plus Meta's own reason beats a URL parameter.
 */
export function ConnectResult() {
  const params = useSearchParams();
  const result = params.get("result");
  const provider = params.get("provider");
  const detail = params.get("detail");

  if (!result || result === "connected") return null;

  const message =
    result === "exchange_failed"
      ? "Could not complete the connection."
      : result === "cancelled"
        ? "Setup was not finished. You can start again whenever you are ready."
        : result === "no_instagram"
          ? "No professional Instagram account was found."
          : result === "no_pages"
            ? "No Facebook Pages were found on that account."
            : result === "not_configured"
              ? "This channel is not set up yet."
              : result.replace(/_/g, " ");

  return (
    <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-900 dark:text-red-200">
        {provider ? `${provider}: ` : ""}
        {message}
      </p>
      {detail && (
        <p className="mt-1 font-mono text-xs text-red-800 dark:text-red-300">
          {detail}
        </p>
      )}
    </div>
  );
}

import { ChannelRow } from "@/components/ChannelRow";
import { getChannels, PROVIDER_ORDER, type Channel } from "@/lib/channels";
import { Suspense } from "react";
import { ConnectResult } from "@/components/ConnectResult";

export const metadata = {
  title: "Channels · Rivon",
  description: "Connect the places your customers message you.",
};

export default async function ChannelsPage() {
  const channels = await getChannels();

  const byProvider = new Map(channels.map((c) => [c.provider, c]));
  const ordered: Channel[] = PROVIDER_ORDER.map(
    (p) => byProvider.get(p) ?? { provider: p, status: "disconnected" as const }
  );

  const live = ordered.filter((c) => c.status === "connected").length;
  const needsAttention = ordered.filter((c) => c.status === "degraded").length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400">
          Setup
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900 dark:text-slate-50">
          Channels
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
          Connect the places your customers already message you. Your agent
          answers on each one, and you approve anything that commits you before
          it is sent.
        </p>
      </header>

      <Suspense fallback={null}>
        <ConnectResult />
      </Suspense>

      {needsAttention > 0 && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {needsAttention === 1
              ? "One channel has stopped working."
              : `${needsAttention} channels have stopped working.`}{" "}
            <span className="font-normal">
              You are not receiving messages from it until it is reconnected.
            </span>
          </p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {live} of {ordered.length} connected
          </p>
        </div>
        {ordered.map((channel) => (
          <ChannelRow key={channel.provider} channel={channel} />
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Why each business needs its own number
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Your customers message <em>you</em>, not us. WhatsApp requires every
          business to connect its own number, so the agent replies from your
          number and the conversation stays yours. The same applies to Instagram
          and Facebook — you grant access to your own accounts, and you can
          revoke it at any time.
        </p>
      </section>
    </main>
  );
}

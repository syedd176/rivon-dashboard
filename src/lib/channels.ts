/**
 * Channel types and mock data.
 *
 * A channel is one messaging surface a tenant has connected — WhatsApp,
 * Instagram, Messenger or the web widget. Each belongs to exactly one tenant,
 * and inbound webhooks are routed by provider id → tenant id.
 *
 * Replace `getChannels()` with a real API call once the backend exists.
 */

export type ChannelProvider = "whatsapp" | "instagram" | "messenger" | "widget";

/**
 * Three states matter in the UI, not two.
 *
 * `degraded` is the one teams forget: the channel is connected but the token
 * has expired or webhooks are failing. A tenant in this state silently stops
 * receiving leads and nobody notices, which is why it gets its own colour and
 * a reason string.
 */
export type ChannelStatus = "connected" | "degraded" | "disconnected";

export interface Channel {
  provider: ChannelProvider;
  status: ChannelStatus;
  /** Phone number, @handle or page name — whatever identifies it to the owner. */
  identifier?: string;
  /**
   * Minutes since the last successful inbound or health check.
   *
   * Stored as an offset rather than a timestamp so the mock data contains no
   * clock reads — those break static prerendering. The real API will return an
   * ISO string and this becomes `lastActivityAt?: string`.
   */
  lastActivityMinutesAgo?: number;
  /** Present only when status is `degraded`. Plain language, shown to the owner. */
  problem?: string;
  /** Web widget only. */
  embedKey?: string;
}

export interface ProviderMeta {
  name: string;
  tagline: string;
  /** What the owner needs before they can connect. Shown before they start. */
  requirement?: string;
  accent: string;
}

export const PROVIDERS: Record<ChannelProvider, ProviderMeta> = {
  whatsapp: {
    name: "WhatsApp",
    tagline: "Answer customer messages on your WhatsApp Business number",
    requirement:
      "You need a phone number that is not already registered to a personal WhatsApp account.",
    accent: "#25D366",
  },
  instagram: {
    name: "Instagram",
    tagline: "Answer direct messages sent to your Instagram profile",
    requirement:
      "Your Instagram account must be a Professional account linked to a Facebook Page.",
    accent: "#E1306C",
  },
  messenger: {
    name: "Facebook Messenger",
    tagline: "Answer messages sent to your Facebook Page",
    requirement: "You need admin access to the Facebook Page.",
    accent: "#0084FF",
  },
  widget: {
    name: "Web widget",
    tagline: "A chat bubble on your own website. No approval needed.",
    accent: "#1C7293",
  },
};

/** Display order. Widget last — it is the one that always works. */
export const PROVIDER_ORDER: ChannelProvider[] = [
  "whatsapp",
  "instagram",
  "messenger",
  "widget",
];

/**
 * Mock tenant state. Deliberately shows all three statuses so the UI is
 * exercised end to end before any real connection exists.
 */
export const MOCK_CHANNELS: Channel[] = [
  {
    provider: "whatsapp",
    status: "connected",
    identifier: "+44 7700 900123",
    lastActivityMinutesAgo: 2,
  },
  {
    provider: "instagram",
    status: "degraded",
    identifier: "@brightclean.uk",
    lastActivityMinutesAgo: 31 * 60,
    problem:
      "Instagram has revoked access. This usually happens when the linked Facebook Page changes owner. Reconnect to start receiving messages again.",
  },
  { provider: "messenger", status: "disconnected" },
  {
    provider: "widget",
    status: "connected",
    identifier: "brightclean.co.uk",
    embedKey: "rvn_wgt_7f3a9c2e41b8",
    lastActivityMinutesAgo: 4 * 60,
  },
];

export async function getChannels(): Promise<Channel[]> {
  // TODO: replace with GET /api/channels once the backend exists.
  return MOCK_CHANNELS;
}

/** "2 minutes ago", "4 hours ago", "3 days ago". */
export function relativeTime(minutesAgo?: number): string {
  if (minutesAgo === undefined) return "never";
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) {
    return `${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

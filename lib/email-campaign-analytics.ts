export const EMAIL_PROVIDER_ORDER = ["Gmail", "Yahoo", "Microsoft", "Apple", "AOL", "Other"] as const;
export type EmailProviderFamily = (typeof EMAIL_PROVIDER_ORDER)[number];
export type CampaignDeliveryEvent = { event_type: string };
export type CampaignDelivery = {
  id: string; recipient_name: string | null; recipient_email: string; current_status: string;
  error_message?: string | null; events?: CampaignDeliveryEvent[] | null;
};
export type CampaignRecipientAnalytics = CampaignDelivery & {
  domain: string; provider: EmailProviderFamily; accepted: boolean; delivered: boolean;
  opened: boolean; clicked: boolean; bounced: boolean; failed: boolean; complained: boolean;
  delayed: boolean; pending: boolean; problem: boolean;
};
export type CampaignMetricCounts = {
  recipients: number; accepted: number; delivered: number; opened: number; clicked: number;
  bounced: number; failed: number; complained: number; delayed: number; pending: number;
  problems: number; deliveryRate: number | null; openRate: number | null; clickRate: number | null;
};
export type ProviderAnalytics = CampaignMetricCounts & {
  provider: EmailProviderFamily; domains: Array<{ domain: string; recipients: number }>;
  recipientRows: CampaignRecipientAnalytics[];
};

function emailDomain(email: string) {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : "";
}

export function classifyEmailProvider(email: string): { provider: EmailProviderFamily; domain: string } {
  const domain = emailDomain(email);
  if (domain === "gmail.com" || domain === "googlemail.com") return { provider: "Gmail", domain };
  if (domain === "yahoo.com" || domain.startsWith("yahoo.") || domain === "ymail.com" || domain === "rocketmail.com") return { provider: "Yahoo", domain };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return { provider: "Microsoft", domain };
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) return { provider: "Apple", domain };
  if (domain === "aol.com") return { provider: "AOL", domain };
  return { provider: "Other", domain: domain || "unknown" };
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function recipientAnalytics(delivery: CampaignDelivery): CampaignRecipientAnalytics {
  const statuses = new Set([
    delivery.current_status?.toLowerCase(),
    ...(delivery.events ?? []).map((event) => event.event_type.toLowerCase().replace(/^email\./, "")),
  ].filter(Boolean));
  const delivered = ["delivered", "opened", "clicked"].some((status) => statuses.has(status));
  const opened = statuses.has("opened");
  const clicked = statuses.has("clicked");
  const bounced = statuses.has("bounced");
  const failed = statuses.has("failed");
  const complained = statuses.has("complained");
  const delayed = statuses.has("delivery_delayed");
  const accepted = !failed && [...statuses].some((status) => status !== "queued");
  const problem = bounced || failed || complained || delayed;
  const pending = accepted && !delivered && !bounced && !complained;
  const { provider, domain } = classifyEmailProvider(delivery.recipient_email);
  return { ...delivery, provider, domain, accepted, delivered, opened, clicked, bounced, failed, complained, delayed, pending, problem };
}

function metricCounts(rows: CampaignRecipientAnalytics[]): CampaignMetricCounts {
  const count = (key: keyof CampaignRecipientAnalytics) => rows.filter((row) => row[key] === true).length;
  const accepted = count("accepted");
  const delivered = count("delivered");
  const opened = count("opened");
  const clicked = count("clicked");
  return {
    recipients: rows.length, accepted, delivered, opened, clicked,
    bounced: count("bounced"), failed: count("failed"), complained: count("complained"),
    delayed: count("delayed"), pending: count("pending"), problems: count("problem"),
    deliveryRate: rate(delivered, accepted), openRate: rate(opened, delivered), clickRate: rate(clicked, delivered),
  };
}

export function buildCampaignAnalytics(deliveries: CampaignDelivery[]) {
  const recipientRows = deliveries.map(recipientAnalytics);
  const providers: ProviderAnalytics[] = EMAIL_PROVIDER_ORDER.map((provider) => {
    const providerRows = recipientRows.filter((row) => row.provider === provider);
    const domainCounts = new Map<string, number>();
    providerRows.forEach((row) => domainCounts.set(row.domain, (domainCounts.get(row.domain) ?? 0) + 1));
    return {
      provider, ...metricCounts(providerRows),
      domains: [...domainCounts].map(([domain, recipients]) => ({ domain, recipients }))
        .sort((a, b) => b.recipients - a.recipients || a.domain.localeCompare(b.domain)),
      recipientRows: providerRows,
    };
  }).filter((provider) => provider.recipients > 0);
  return { ...metricCounts(recipientRows), providers, recipientRows };
}

export function formatCampaignRate(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value)}%`;
}

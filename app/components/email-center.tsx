"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import { SavedDiscountCodes, type SavedDiscountSelection } from "@/app/components/saved-discount-codes";
import { ScheduledEmailCampaigns } from "@/app/components/scheduled-email-campaigns";
import {
  EMAIL_CENTER_AUDIENCES,
  dedupeEmailCenterAudienceRecipients,
  recipientsForEmailCenterAudience,
  renderEmailCenterRecipient,
  renderEmailCenterRecipientEmail,
  type EmailCenterAudienceKey,
  type EmailCenterAudienceRecipient,
} from "@/lib/email-center-audiences";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import {
  EMAIL_CENTER_MERGE_FIELDS,
  findUnresolvedEmailCenterMergeFields,
  resolveEmailCenterMergeFields,
  splitEmailCenterName,
  type EmailCenterMergeValues,
} from "@/lib/email-center";
import {
  getManualEmailTemplate,
  manualEmailSenders,
  manualEmailTemplates,
  MANUAL_EMAIL_REPLY_TO,
  isValidManualEmailAddress,
  type ManualEmailSenderKey,
  type ManualEmailTemplateKey,
} from "@/lib/manual-email-center";
import { PRESALE_EMAIL_TEMPLATE_KEY, validatePresaleEmailFields, withPresaleGreetingFallback } from "@/lib/email-center-presale";
import { buildCampaignAnalytics, formatCampaignRate, type CampaignDelivery } from "@/lib/email-campaign-analytics";
import { scheduledEmailRunForEasternDate } from "@/lib/scheduled-email-time";

type Recipient = EmailCenterAudienceRecipient;
type EmailEvent = { id: string; type: string; createdAt: string; recipient: string | null; clickedUrl: string | null; detail: string | null };
type HistoryItem = {
  activityType: "email_center" | "automatic_presale" | "presale_resend"; displayType: string;
  id: string; recipientName: string | null; recipientEmail: string; fromAddress: string; replyTo: string | null;
  subject: string; message: string | null; templateKey: string; sendStatus: string; currentStatus: string;
  resendMessageId: string | null; errorMessage: string | null; sentAt: string | null;
  lastActivityAt: string; createdAt: string; events: EmailEvent[];
};
type BulkOperation = {
  id: string; audience_label: string; template_key: string; selected_recipient_count: number;
  sent_count: number; failed_count: number; skipped_count: number; operation_status: string;
  completed_at: string | null; created_at: string;
};
type BulkDelivery = CampaignDelivery & {
  id: string; bulk_operation_id: string; recipient_name: string | null; recipient_email: string;
  subject: string; current_status: string; error_message: string | null; created_at: string;
};
type ApiResponse = { success?: boolean; error?: string; warning?: string; resendMessageId?: string | null; history?: HistoryItem | null };
type HistoryFilter = "all" | "sent" | "delivered" | "opened" | "clicked" | "problems";
type EmailCenterShowContext = { slug: string; name: string; showDate: string | null; ticketSaleStatus?: string | null; effectiveTicketSaleStatus?: string | null; ticketSaleManualOverride?: boolean; ticketSaleConfigurationError?: string | null };
type EmailCenterSection = "compose" | "templates" | "discount-codes" | "sent";
const EMAIL_CENTER_SECTIONS: Array<{ key: EmailCenterSection; label: string }> = [{ key: "compose", label: "Compose" }, { key: "templates", label: "Templates" }, { key: "discount-codes", label: "Discount Codes" }, { key: "sent", label: "Sent & Activity" }];

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function formatShowDate(value: string | null) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}
function statusTone(status: string) {
  if (["bounced", "failed", "complained"].includes(status)) return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (status === "delivery_delayed") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (["delivered", "opened", "clicked"].includes(status)) return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  return "border-sky-400/30 bg-sky-500/10 text-sky-100";
}
function statusLabel(status: string) {
  return status.replace("delivery_delayed", "Delayed").replace(/_/g, " ").replace(/^./, (value) => value.toUpperCase());
}
function eventLabel(type: string) {
  return statusLabel(type.replace("email.", ""));
}

function CampaignAnalyticsPanel({ deliveries }: { deliveries: BulkDelivery[] }) {
  const analytics = buildCampaignAnalytics(deliveries);
  const overallMetrics = [
    ["Total recipients", analytics.recipients], ["Accepted", analytics.accepted], ["Delivered", analytics.delivered],
    ["Pending", analytics.pending], ["Opened", analytics.opened], ["Clicked", analytics.clicked],
    ["Bounced", analytics.bounced], ["Failed", analytics.failed], ["Complained", analytics.complained],
    ["Problems", analytics.problems],
  ] as const;
  const insights = [
    ...analytics.providers.slice(0, 3).map((provider) => `${provider.provider}: ${provider.delivered} of ${provider.recipients} delivered`),
    ...(analytics.pending ? [`${analytics.pending} recipient${analytics.pending === 1 ? " has" : "s have"} not reported delivery yet`] : []),
    ...(analytics.bounced ? [`${analytics.bounced} delivery${analytics.bounced === 1 ? "" : "ies"} bounced`] : []),
  ];

  return <details className="mt-4 rounded-xl border border-sky-400/25 bg-sky-500/[0.06] p-3">
    <summary className="cursor-pointer text-sm font-bold text-sky-100">Campaign Analytics</summary>
    <div className="mt-4 grid gap-5 border-t border-white/10 pt-4">
      <section aria-label="Overall campaign analytics">
        <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Overall</h4>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{overallMetrics.map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>)}</div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p><strong>{formatCampaignRate(analytics.deliveryRate)}</strong> delivery rate <span className="text-slate-400">({analytics.delivered}/{analytics.accepted} accepted)</span></p>
          <p><strong>{formatCampaignRate(analytics.openRate)}</strong> open rate <span className="text-slate-400">({analytics.opened}/{analytics.delivered} delivered)</span></p>
          <p><strong>{formatCampaignRate(analytics.clickRate)}</strong> click rate <span className="text-slate-400">({analytics.clicked}/{analytics.delivered} delivered)</span></p>
        </div>
        <p className="mt-2 text-xs text-slate-400" title="Open tracking is approximate because email apps handle tracking differently.">Open tracking is approximate. Some email apps may block tracking or report opens automatically.</p>
      </section>
      <section aria-label="Campaign analytics by email provider">
        <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">By Email Provider</h4>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-[680px] w-full text-left text-xs"><thead className="bg-white/[0.05] text-slate-400"><tr><th className="p-3">Provider</th><th>Recipients</th><th>Delivered</th><th>Opened</th><th>Open Rate</th><th>Clicked</th><th>Problems</th></tr></thead><tbody>{analytics.providers.map((provider) => <tr key={provider.provider} className="border-t border-white/10"><th className="p-3 text-white">{provider.provider}</th><td>{provider.recipients}</td><td>{provider.delivered}</td><td>{provider.opened}</td><td>{formatCampaignRate(provider.openRate)}</td><td>{provider.clicked}</td><td>{provider.problems}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-label="Provider recipient details" className="grid gap-2">
        <h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Provider Recipients</h4>
        {analytics.providers.map((provider) => <details key={provider.provider} className="rounded-xl border border-white/10 bg-black/15 p-3"><summary className="cursor-pointer text-sm font-bold">{provider.provider} — {provider.recipients} recipient{provider.recipients === 1 ? "" : "s"}</summary><div className="mt-3 grid gap-2">{provider.recipientRows.map((recipient) => <div key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><span className="min-w-0"><strong className="block truncate text-white">{recipient.recipient_name || recipient.recipient_email}</strong><span className="block break-all text-slate-400">{recipient.recipient_email}</span></span><span className={`rounded-full border px-2 py-1 ${statusTone(recipient.current_status)}`}>{statusLabel(recipient.current_status)}</span></div>)}</div></details>)}
      </section>
      <details className="rounded-xl border border-white/10 bg-black/15 p-3"><summary className="cursor-pointer text-sm font-bold">Domain Details</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{analytics.providers.map((provider) => <div key={provider.provider}><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{provider.provider} ({provider.recipients})</p>{provider.domains.map((domain) => <p key={domain.domain} className="mt-1 flex justify-between gap-3 text-xs"><span className="break-all">{domain.domain}</span><strong>{domain.recipients}</strong></p>)}</div>)}</div></details>
      {insights.length ? <section aria-label="Campaign insights"><h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Insights</h4><ul className="mt-2 grid gap-1 text-sm text-slate-300">{insights.map((insight) => <li key={insight}>• {insight}</li>)}</ul></section> : null}
    </div>
  </details>;
}

export function EmailCenter({ slug }: { slug: string }) {
  const initialTemplate = manualEmailTemplates[0];
  const [senderKey, setSenderKey] = useState<ManualEmailSenderKey>("info");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [mergeFields, setMergeFields] = useState<EmailCenterMergeValues>({});
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [audienceKey, setAudienceKey] = useState<EmailCenterAudienceKey | "">("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<ManualEmailTemplateKey>(initialTemplate.key);
  const [subject, setSubject] = useState<string>(initialTemplate.subject);
  const [message, setMessage] = useState(initialTemplate.message);
  const [heading, setHeading] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [bulkOperations, setBulkOperations] = useState<BulkOperation[]>([]);
  const [bulkDeliveries, setBulkDeliveries] = useState<BulkDelivery[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySearch, setHistorySearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<"success" | "error">("success");

  const [showContext, setShowContext] = useState<EmailCenterShowContext | null>(null);
  const [currentUpcomingShow, setCurrentUpcomingShow] = useState<EmailCenterShowContext | null>(null);
  const [activeSection, setActiveSection] = useState<EmailCenterSection>("compose");
  const selectedSender = manualEmailSenders.find((sender) => sender.key === senderKey) ?? null;
  const usesTicketPromotion = templateKey === "ticket_discount";
  const campaignMergeFields: EmailCenterMergeValues = { promo_code: mergeFields.promo_code ?? "", promo_offer: mergeFields.promo_offer ?? "", ticket_link: mergeFields.ticket_link ?? "" };
  const usesPresaleTemplate = templateKey === PRESALE_EMAIL_TEMPLATE_KEY;
  const effectiveMergeFields = usesPresaleTemplate ? withPresaleGreetingFallback(mergeFields) : mergeFields;
  const presaleProblems = usesPresaleTemplate ? validatePresaleEmailFields(effectiveMergeFields) : [];
  const presaleStatusWarning = !usesPresaleTemplate ? null
    : showContext?.ticketSaleConfigurationError ? showContext.ticketSaleConfigurationError
      : showContext?.ticketSaleManualOverride ? "Ticket sales are currently disabled by the manual Not On Sale override."
        : showContext?.effectiveTicketSaleStatus === "presale" ? null
          : showContext?.effectiveTicketSaleStatus === "public" ? "Presale has ended; this show is now in Public Sale."
            : showContext?.effectiveTicketSaleStatus === "not_on_sale" ? "Presale is scheduled but has not started yet."
              : "Ticket sale status is unavailable for this show.";
  const usesAudienceRecipients = Boolean(audienceKey);
  const uniqueRecipients = useMemo(() => dedupeEmailCenterAudienceRecipients(recipients).recipients, [recipients]);
  const audienceResult = useMemo(() => audienceKey
    ? recipientsForEmailCenterAudience(recipients, audienceKey)
    : { recipients: [], recordsFound: 0, duplicatesRemoved: 0, uniqueRecipients: 0 }, [recipients, audienceKey]);
  const audienceRows = useMemo(() => audienceResult.recipients.map((recipient) => ({
    recipient,
    ...renderEmailCenterRecipientEmail({
      recipient: { ...recipient, mergeFields: { ...recipient.mergeFields, ...campaignMergeFields } },
      templateKey, subjectTemplate: subject, messageTemplate: message, headingTemplate: heading,
      ctaLabelTemplate: ctaLabel, ctaUrlTemplate: ctaUrl,
      promoOfferTemplate: mergeFields.promo_offer, promoCodeTemplate: mergeFields.promo_code,
      senderValid: Boolean(selectedSender),
      unsubscribeUrl: recipient.id.startsWith("mailing:")
        ? "https://stageflow.cumberlandmountainmusic.com/mailing-list/unsubscribe?token=recipient-specific-secure-link"
        : undefined,
    }),
  })), [audienceResult.recipients, templateKey, subject, message, heading, ctaLabel, ctaUrl, selectedSender, mergeFields.promo_code, mergeFields.promo_offer, mergeFields.ticket_link]);
  const selectedRecipientSet = useMemo(() => new Set(selectedRecipientIds), [selectedRecipientIds]);
  const selectedReadyRows = audienceRows.filter((row) => row.ready && selectedRecipientSet.has(row.recipient.id));
  const readyAudienceRows = audienceRows.filter((row) => row.ready);
  const previewRows = audienceRows.filter((row) => isValidManualEmailAddress(row.recipient.email));
  const boundedPreviewIndex = Math.min(previewRecipientIndex, Math.max(previewRows.length - 1, 0));
  const previewRow = previewRows[boundedPreviewIndex] ?? null;
  const problemRows = audienceRows.filter((row) => !row.ready);
  const excludedCount = audienceRows.filter((row) => row.ready && !selectedRecipientSet.has(row.recipient.id)).length;
  const renderedSubject = useMemo(() => resolveEmailCenterMergeFields(subject, effectiveMergeFields).rendered, [subject, effectiveMergeFields]);
  const renderedMessage = useMemo(() => resolveEmailCenterMergeFields(message, effectiveMergeFields).rendered, [message, effectiveMergeFields]);
  const renderedHeading = useMemo(() => resolveEmailCenterMergeFields(heading, effectiveMergeFields).rendered, [heading, effectiveMergeFields]);
  const renderedCtaLabel = useMemo(() => resolveEmailCenterMergeFields(ctaLabel, effectiveMergeFields).rendered, [ctaLabel, effectiveMergeFields]);
  const renderedCtaUrl = useMemo(() => resolveEmailCenterMergeFields(ctaUrl, effectiveMergeFields).rendered, [ctaUrl, effectiveMergeFields]);
  const renderedPromoOffer = useMemo(() => resolveEmailCenterMergeFields(effectiveMergeFields.promo_offer ?? "", effectiveMergeFields).rendered, [effectiveMergeFields]);
  const renderedPromoCode = useMemo(() => resolveEmailCenterMergeFields(effectiveMergeFields.promo_code ?? "", effectiveMergeFields).rendered, [effectiveMergeFields]);
  const previewUnsubscribeUrl = audienceKey === "mailing_list_subscribers" || selectedRecipientId?.startsWith("mailing:") ? "https://stageflow.cumberlandmountainmusic.com/mailing-list/unsubscribe?token=recipient-specific-secure-link" : undefined;
  const renderedEmail = useMemo(() => renderEmailCenterEmail({ heading: renderedHeading, message: renderedMessage, ctaLabel: renderedCtaLabel, ctaUrl: renderedCtaUrl, unsubscribeUrl: previewUnsubscribeUrl, promoOffer: renderedPromoOffer, promoCode: renderedPromoCode }), [renderedHeading, renderedMessage, renderedCtaLabel, renderedCtaUrl, previewUnsubscribeUrl, renderedPromoOffer, renderedPromoCode]);
  const unresolvedFields = useMemo(() => findUnresolvedEmailCenterMergeFields(renderedSubject, renderedMessage, renderedHeading, renderedCtaLabel, renderedCtaUrl, renderedPromoOffer, renderedPromoCode), [renderedSubject, renderedMessage, renderedHeading, renderedCtaLabel, renderedCtaUrl, renderedPromoOffer, renderedPromoCode]);
  const checks = [
    { label: "Recipient", ok: usesAudienceRecipients || isValidManualEmailAddress(recipientEmail), issue: "Enter a valid recipient email." },
    { label: "Sender", ok: Boolean(selectedSender), issue: "Select an allowlisted sender." },
    { label: "Subject", ok: Boolean(renderedSubject.trim()), issue: "Subject is blank." },
    { label: "Message", ok: Boolean(renderedMessage.trim()), issue: "Message is blank." },
    ...(usesTicketPromotion ? [{ label: "Promotion", ok: Boolean(renderedPromoOffer.trim()) === Boolean(renderedPromoCode.trim()), issue: "Promotion requires both offer text and a promo code." }] : []),
    ...(usesPresaleTemplate ? [{ label: "Presale show data", ok: presaleProblems.length === 0, issue: presaleProblems[0] ?? "" }] : []),
    { label: "CTA", ok: Boolean(renderedCtaLabel.trim()) === Boolean(renderedCtaUrl.trim()) && (!renderedCtaUrl.trim() || /^https:\/\//i.test(renderedCtaUrl.trim())), issue: "CTA requires both a label and an HTTPS URL." },
    { label: "Merge fields", ok: unresolvedFields.length === 0, issue: unresolvedFields.length ? `Unresolved field: ${unresolvedFields[0]}` : "" },
    { label: "Send state", ok: !isSending, issue: "A send is already in progress." },
  ];
  const ready = checks.every((check) => check.ok);
  const matchingRecipients = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return [];
    return uniqueRecipients.filter((recipient) => `${recipient.name} ${recipient.email}`.toLowerCase().includes(query)).slice(0, 8);
  }, [recipientQuery, uniqueRecipients]);
  const templateLabels = useMemo(() => Object.fromEntries(manualEmailTemplates.map((item) => [item.key, item.label])), []);
  const filteredHistory = history.filter((item) => {
    const statusMatches = historyFilter === "all"
      || (historyFilter === "problems" ? ["bounced", "failed", "complained", "delivery_delayed"].includes(item.currentStatus) : item.currentStatus === historyFilter);
    const needle = historySearch.trim().toLowerCase();
    const searchMatches = !needle || `${item.recipientName ?? ""} ${item.recipientEmail} ${item.subject} ${item.displayType}`.toLowerCase().includes(needle);
    return statusMatches && searchMatches;
  });

  const today = new Date().toISOString().slice(0, 10);
  const isPastShow = Boolean(showContext?.showDate && showContext.showDate < today);
  const currentShowLink = currentUpcomingShow && currentUpcomingShow.slug !== showContext?.slug ? currentUpcomingShow : null;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true); setLoadError(null);
      try {
        const [historyResponse, recipientsResponse, bulkResponse] = await Promise.all([
          fetch(`/api/admin/email-center?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }),
          fetch(`/api/admin/email-center?slug=${encodeURIComponent(slug)}&mode=recipients`, { cache: "no-store" }),
          fetch(`/api/admin/email-center/bulk?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }),
        ]);
        const historyPayload = await historyResponse.json() as { success?: boolean; error?: string; history?: HistoryItem[] };
        const recipientsPayload = await recipientsResponse.json() as { success?: boolean; error?: string; recipients?: Recipient[]; show?: EmailCenterMergeValues; showContext?: EmailCenterShowContext; currentUpcomingShow?: EmailCenterShowContext | null };
        const bulkPayload = await bulkResponse.json() as { success?: boolean; error?: string; operations?: BulkOperation[]; deliveries?: BulkDelivery[] };
        if (!historyResponse.ok || !historyPayload.success) throw new Error(historyPayload.error || "Unable to load recent emails.");
        if (!recipientsResponse.ok || !recipientsPayload.success) throw new Error(recipientsPayload.error || "Unable to load recipients.");
        if (!bulkResponse.ok || !bulkPayload.success) throw new Error(bulkPayload.error || "Unable to load bulk sends.");
        if (!cancelled) {
          setHistory(historyPayload.history ?? []);
          setRecipients(recipientsPayload.recipients ?? []);
          setMergeFields(recipientsPayload.show ?? {});
          setBulkOperations(bulkPayload.operations ?? []);
          setBulkDeliveries(bulkPayload.deliveries ?? []);
          setShowContext(recipientsPayload.showContext ?? null);
          setCurrentUpcomingShow(recipientsPayload.currentUpcomingShow ?? null);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load Email Center.");
      } finally { if (!cancelled) setIsLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug]);
  useEffect(() => {
    function sectionFromHash(): EmailCenterSection {
      const value = window.location.hash.slice(1);
      return EMAIL_CENTER_SECTIONS.some((section) => section.key === value) ? value as EmailCenterSection : "compose";
    }
    const update = () => setActiveSection(sectionFromHash());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function chooseSection(section: EmailCenterSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${section}`);
  }


  function chooseAudience(value: EmailCenterAudienceKey | "") {
    setAudienceKey(value);
    setResultMessage(null);
    setPreviewRecipientIndex(0);
    if (!value) {
      setSelectedRecipientIds([]);
      return;
    }
    const result = recipientsForEmailCenterAudience(recipients, value);
    setSelectedRecipientIds(result.recipients
      .filter((recipient) => renderEmailCenterRecipient({
        templateKey,
        recipient,
        subjectTemplate: subject,
        messageTemplate: message,
        headingTemplate: heading, ctaLabelTemplate: ctaLabel, ctaUrlTemplate: ctaUrl,
        senderValid: Boolean(selectedSender),
      }).ready)
      .map((recipient) => recipient.id));
  }

  function toggleAudienceRecipient(id: string) {
    setSelectedRecipientIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function handleBulkSubmit() {
    if (!audienceKey || !selectedSender || !selectedReadyRows.length) return;
    const audience = EMAIL_CENTER_AUDIENCES.find((item) => item.key === audienceKey);
    if (!audience) return;
    const confirmation = [
      `Audience: ${audience.label}`,
      `Selected Recipients: ${selectedReadyRows.length}`,
      `Excluded: ${excludedCount}`,
      `Problems: ${problemRows.length}`,
      `Sender: ${selectedSender.from}`,
      `Subject: ${subject}`,
      "",
      `Type SEND ${selectedReadyRows.length} EMAILS to confirm.`,
    ].join("\n");
    if (window.prompt(confirmation) !== `SEND ${selectedReadyRows.length} EMAILS`) return;
    setIsSending(true);
    setResultMessage(null);
    setBulkProgress(`Sending 0 of ${selectedReadyRows.length}...`);
    try {
      const response = await fetch("/api/admin/email-center/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          operationId: crypto.randomUUID(),
          audienceKey,
          senderKey,
          templateKey,
          subject,
          message,
          heading, ctaLabel, ctaUrl,
          campaignMergeFields,
          selectedRecipientIds: selectedReadyRows.map((row) => row.recipient.id),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to complete bulk send.");
      setBulkProgress(`${payload.sentCount} accepted - ${payload.failedCount} failed - ${payload.skippedCount} skipped`);
      setResultTone("success");
      setResultMessage(`Bulk send completed: ${payload.sentCount} accepted, ${payload.failedCount} failed.`);
    } catch (error) {
      setResultTone("error");
      setResultMessage(error instanceof Error ? error.message : "Unable to complete bulk send.");
      setBulkProgress(null);
    } finally {
      setIsSending(false);
    }
  }

  async function scheduleBulkCampaign() {
    if (!audienceKey || !selectedSender || !selectedReadyRows.length || !scheduleDate) return;
    const audience = EMAIL_CENTER_AUDIENCES.find((item) => item.key === audienceKey);
    const expected = scheduledEmailRunForEasternDate(scheduleDate);
    if (!audience || !expected) { setResultTone("error"); setResultMessage("Choose a future Eastern date with an available scheduler run."); return; }
    const confirmation = [
      `Schedule: ${subject}`,
      `Audience: ${audience.label}`,
      `Currently Eligible: ${selectedReadyRows.length}`,
      `Expected Send: ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York", timeZoneName: "short" }).format(expected)}`,
      "",
      "Recipients will be re-evaluated at send time.",
      "This uses StageFlow's once-daily Vercel Hobby scheduler.",
      "",
      "Schedule this campaign?",
    ].join("\n");
    if (!window.confirm(confirmation)) return;
    setIsSending(true); setResultMessage(null);
    try {
      const response = await fetch("/api/admin/email-center/scheduled-general", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, audienceKey, senderKey, templateKey, subject, message, heading, ctaLabel, ctaUrl, campaignMergeFields, sendDate: scheduleDate }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; expectedSend?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to schedule this campaign.");
      setResultTone("success");
      setResultMessage(`Campaign scheduled for the next available daily run: ${payload.expectedSend ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(payload.expectedSend)) : "scheduled"}.`);
      window.dispatchEvent(new Event("email-center-scheduled"));
    } catch (error) {
      setResultTone("error"); setResultMessage(error instanceof Error ? error.message : "Unable to schedule this campaign.");
    } finally { setIsSending(false); }
  }

  function selectRecipient(recipient: Recipient) {
    setSelectedRecipientId(recipient.id); setRecipientName(recipient.name); setRecipientEmail(recipient.email);
    setRecipientQuery(recipient.name || recipient.email); setMergeFields((current) => ({ ...recipient.mergeFields, promo_code: current.promo_code, promo_offer: current.promo_offer, ticket_link: current.ticket_link })); setResultMessage(null);
  }
  function changeRecipientEmail(value: string) {
    setRecipientEmail(value); setSelectedRecipientId(null);
    setMergeFields((current) => ({ ...current, email: value.trim(), first_name: recipientName.split(/\s+/)[0] ?? "", full_name: recipientName }));
  }
  function changeTicketPurchaseUrl(value: string) {
    setMergeFields((current) => ({ ...current, ticket_link: value }));
    setCtaUrl(value);
    setCtaLabel((current) => value.trim() ? (current.trim() || "Get Tickets") : "");
  }
  function selectSavedDiscountCode(selection: SavedDiscountSelection) {
    setMergeFields((current) => ({ ...current, promo_code: selection.code, promo_offer: selection.offerText, ticket_link: selection.ticketUrl }));
    setCtaUrl(selection.ticketUrl);
    setCtaLabel(selection.ticketUrl ? "Get Tickets" : "");
  }
  function handleTemplateChange(nextKey: ManualEmailTemplateKey) {
    const template = getManualEmailTemplate(nextKey);
    if (!template) return;
    setTemplateKey(nextKey); setSubject(template.subject); setMessage(template.message); setHeading(template.heading); setCtaLabel(template.ctaLabel); setCtaUrl(template.ctaUrl); setResultMessage(null);
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usesAudienceRecipients) {
      await handleBulkSubmit();
      return;
    }
    if (isSending || !ready || !selectedSender) return;
    const confirmed = window.confirm([
      `To: ${recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail}`,
      `From: ${selectedSender.from}`, `Subject: ${renderedSubject}`, "", "Send Email?",
    ].join("\n"));
    if (!confirmed) return;
    setIsSending(true); setResultMessage(null);
    try {
      const response = await fetch("/api/admin/email-center", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, requestId: crypto.randomUUID(), senderKey, recipientEmail, recipientName,
          selectedRecipientId, mergeFields, templateKey, subject, message, heading, ctaLabel, ctaUrl }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send this email.");
      if (payload.history) setHistory((current) => [payload.history!, ...current].slice(0, 50));
      setResultTone("success"); setResultMessage(payload.warning || "Email sent successfully.");
    } catch (error) {
      setResultTone("error"); setResultMessage(error instanceof Error ? error.message : "Unable to send this email.");
    } finally { setIsSending(false); }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-stone-950 px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6">
        <AdminQuickNav slug={slug} currentView="email-center" />
        <header aria-label="Email Center header" className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl md:flex-row md:items-start md:justify-between sm:p-7">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">StageFlow Admin</p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Email Center</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">Compose, preview, send, and audit show-scoped messages through Resend.</p>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:max-w-xl md:items-end">
            {showContext ? (
              <section
                aria-label="Current show context"
                className={`w-full rounded-2xl border px-4 py-3 md:w-auto md:min-w-80 ${isPastShow ? "border-amber-400/50 bg-amber-950/40" : "border-emerald-400/35 bg-emerald-950/30"}`}
              >
                <p className={`text-[0.68rem] font-black uppercase tracking-[0.18em] ${isPastShow ? "text-amber-300" : "text-emerald-300"}`}>
                  {isPastShow ? "Past Show" : "Current Show"}
                </p>
                <p className="mt-1 text-sm font-bold text-white">{showContext.name}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-300">{formatShowDate(showContext.showDate)}</p>
                {isPastShow ? (
                  <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-100">
                    You are viewing the Email Center for a past show. Messages sent here will be recorded under this show.
                  </p>
                ) : null}
                {currentShowLink ? (
                  <Link href={`/admin/${encodeURIComponent(currentShowLink.slug)}/email-center`} className="mt-2 inline-flex w-fit rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-100">
                    Go to Current Show Email Center
                  </Link>
                ) : null}
              </section>
            ) : null}
            <div className="flex w-full flex-wrap gap-2 md:justify-end">
              <Link href={`/admin/${encodeURIComponent(slug)}/mailing-list`} className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100">Mailing List</Link>
              <a href="https://webmail.porkbun.com/?_task=mail&_mbox=INBOX" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950">Open Webmail</a>
              <Link href={`/admin/${encodeURIComponent(slug)}`} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold">Back to Admin</Link>
            </div>
          </div>
        </header>

        <nav aria-label="Email Center sections" className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 p-2 shadow-xl"><div className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-4">{EMAIL_CENTER_SECTIONS.map((section) => <button key={section.key} type="button" onClick={() => chooseSection(section.key)} aria-current={activeSection === section.key ? "page" : undefined} className={`rounded-xl px-4 py-3 text-sm font-bold ${activeSection === section.key ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-white/[0.07]"}`}>{section.label}</button>)}</div></nav>

        {activeSection === "compose" ? <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
          <form className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
            <div><h2 className="text-xl font-black">Compose</h2><p className="mt-1 text-sm text-slate-400">Choose one contact or a dynamic current-show audience.</p></div>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <div aria-label="Composer" className="grid min-w-0 gap-6">
            <label className="grid gap-2 text-sm font-semibold">Audience
              <select
                value={audienceKey}
                onChange={(event) => chooseAudience(event.target.value as EmailCenterAudienceKey | "")}
                className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3"
              >
                <option value="">Individual recipient</option>
                {EMAIL_CENTER_AUDIENCES.map((audience) => (
                  <option key={audience.key} value={audience.key}>{audience.label}</option>
                ))}
              </select>
            </label>
            <div aria-label="Sender and recipient fields" className="grid gap-6">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid min-w-0 gap-2 text-sm font-semibold">From
                  <select value={senderKey} onChange={(event) => setSenderKey(event.target.value as ManualEmailSenderKey)} className="w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-white/15 bg-slate-950 px-3 py-3">
                    {manualEmailSenders.map((sender) => <option key={sender.key} value={sender.key}>{sender.label} - {sender.address}</option>)}
                  </select><span className="text-xs font-normal text-slate-400">Reply-To: {MANUAL_EMAIL_REPLY_TO}</span>
                </label>
                <div className="relative grid min-w-0 content-start gap-2 text-sm font-semibold">
                  <label htmlFor="recipient-search">Find show recipient</label>
                  <input id="recipient-search" value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search name or email" autoComplete="off" className="w-full min-w-0 rounded-xl border border-white/15 bg-slate-950 px-3 py-3" />
                  {matchingRecipients.length ? <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-white/15 bg-slate-950 shadow-2xl">
                    {matchingRecipients.map((recipient) => <button key={recipient.id} type="button" onClick={() => selectRecipient(recipient)} className="block w-full border-b border-white/10 px-3 py-3 text-left last:border-0 hover:bg-white/[0.08]">
                      <span className="block font-bold text-white">{recipient.name || recipient.email}</span><span className="block text-xs text-slate-300">{recipient.email}</span>
                      <span className="block text-xs text-emerald-300">{recipient.sourceLabel} - {recipient.detail}</span>
                    </button>)}
                  </div> : null}
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid min-w-0 gap-2 text-sm font-semibold">Recipient name
                  <input value={recipientName} disabled={usesAudienceRecipients} onChange={(event) => { const name = splitEmailCenterName(event.target.value); setRecipientName(event.target.value); setSelectedRecipientId(null); setMergeFields((current) => ({ ...current, first_name: name.firstName, last_name: name.lastName, full_name: name.fullName })); }} placeholder={usesAudienceRecipients ? "Uses selected audience recipients" : "Optional for manual recipients"} className="w-full min-w-0 rounded-xl border border-white/15 bg-slate-950 px-3 py-3 disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold">To
                  <input type="email" required={!usesAudienceRecipients} disabled={usesAudienceRecipients} value={recipientEmail} onChange={(event) => changeRecipientEmail(event.target.value)} placeholder={usesAudienceRecipients ? "Uses selected audience recipients" : "recipient@example.com"} className="w-full min-w-0 rounded-xl border border-white/15 bg-slate-950 px-3 py-3 disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
              </div>
            </div>
            <label className="grid gap-2 text-sm font-semibold">Template
              <select value={templateKey} onChange={(event) => handleTemplateChange(event.target.value as ManualEmailTemplateKey)} className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3">
                {manualEmailTemplates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
              </select><span className="text-xs font-normal text-slate-400">Template selection fills editable fields; it never changes the saved template.</span>
            </label>
            <label className="grid gap-2 text-sm font-semibold">Subject
              <input maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">Message
              <textarea maxLength={20000} rows={14} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-64 resize-y rounded-xl border border-white/15 bg-slate-950 px-3 py-3 font-mono text-sm leading-6" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">Email Heading (optional)
              <input maxLength={200} value={heading} onChange={(event) => setHeading(event.target.value)} placeholder="A message from CMMS" className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" />
            </label>
            {usesTicketPromotion ? <section className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4"><h3 className="font-bold text-amber-200">Ticket Promotion Details (optional)</h3><p className="mt-1 text-xs text-slate-400">Used by the Save on Tickets template. Change these for every promotion.</p><div className="mt-4 grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-semibold">Discount / Promo Code<input value={mergeFields.promo_code ?? ""} onChange={(event) => setMergeFields((current) => ({ ...current, promo_code: event.target.value }))} placeholder="SAVE10" className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" /></label><label className="grid gap-2 text-sm font-semibold">Offer Text<input value={mergeFields.promo_offer ?? ""} onChange={(event) => setMergeFields((current) => ({ ...current, promo_offer: event.target.value }))} placeholder="Save $5 on each ticket" className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" /></label><label className="grid gap-2 text-sm font-semibold">Ticket Purchase URL<input type="url" value={mergeFields.ticket_link ?? ""} onChange={(event) => changeTicketPurchaseUrl(event.target.value)} placeholder="https://..." className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" /></label></div></section> : null}
            {presaleStatusWarning ? <div role="status" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">{presaleStatusWarning}</div> : null}
            <div className="grid gap-5 md:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">CTA Button Label (optional)<input maxLength={80} value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="Get Tickets" className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" /></label>{usesPresaleTemplate ? <label className="grid gap-2 text-sm font-semibold">CTA URL from Show Details<input type="url" value={effectiveMergeFields.ticket_link ?? ""} readOnly aria-readonly="true" placeholder="No ticket link saved in Show Details" className="cursor-not-allowed rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-slate-300" /><span className="text-xs font-normal text-slate-400">Uses the selected show's authoritative ticket link. Update it in Show Details.</span></label> : <label className="grid gap-2 text-sm font-semibold">CTA URL (optional)<input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="https://..." className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3" /></label>}</div>
              </div>
              <div aria-label="Preview and validation" className="grid min-w-0 gap-5 xl:sticky xl:top-6">

            {audienceKey ? (
              <div className="grid gap-5">
              <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Recipient Preview</h3>
                    <p className="text-xs text-slate-400">
                      Audience records found: {audienceResult.recordsFound} - Duplicates removed: {audienceResult.duplicatesRemoved} - Unique recipients: {audienceResult.uniqueRecipients}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSelectedRecipientIds(audienceRows.filter((row) => row.ready).map((row) => row.recipient.id))} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold">Select All Ready</button>
                    <button type="button" onClick={() => setSelectedRecipientIds([])} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold">Clear All</button>
                  </div>
                </div>
                <p className="mt-3 text-sm">
                  <span className="text-emerald-300">Ready: {audienceRows.filter((row) => row.ready).length}</span>
                  {" - "}<span className="text-amber-300">Needs Attention: {problemRows.length}</span>
                  {" - "}Selected: {selectedReadyRows.length}
                </p>
                {audienceKey === "mailing_list_subscribers" ? <p className="mt-2 text-sm font-semibold text-white">Mailing List · {readyAudienceRows.length} recipient{readyAudienceRows.length === 1 ? "" : "s"}</p> : null}
                {audienceResult.duplicatesRemoved || problemRows.length ? <p className="mt-1 text-xs text-amber-200">
                  Excluded: {audienceResult.duplicatesRemoved} duplicate{audienceResult.duplicatesRemoved === 1 ? "" : "s"}; {problemRows.length} invalid, missing, or unrenderable recipient{problemRows.length === 1 ? "" : "s"}.
                </p> : null}
                <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-white/10">
                  {audienceRows.map((row) => (
                    <label key={row.recipient.id} className="flex gap-3 border-b border-white/10 p-3 last:border-0">
                      <input type="checkbox" checked={row.ready && selectedRecipientSet.has(row.recipient.id)} disabled={!row.ready} onChange={() => toggleAudienceRecipient(row.recipient.id)} />
                      <span className="min-w-0">
                        <strong className="block">{row.recipient.name || "Unnamed contact"}</strong>
                        <span className="block break-all text-xs text-slate-300">{row.recipient.email || "Missing email address"}</span>
                        <span className="block text-xs text-slate-400">{row.recipient.sourceLabel} - {row.recipient.detail}</span>
                        <span className={`block text-xs ${row.ready ? "text-emerald-300" : "text-amber-300"}`}>
                          {row.ready ? "Ready" : row.problems.join("; ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-white/10 bg-black/20 p-4" aria-label="Bulk recipient email preview">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Final Recipient Preview</h3>
                    {previewRow ? <>
                      <p className="mt-1 text-sm text-white">Previewing {boundedPreviewIndex + 1} of {previewRows.length} recipients</p>
                      <p className="text-xs text-slate-300">{previewRow.recipient.name ? `${previewRow.recipient.name} · ` : ""}{previewRow.recipient.email}</p>
                    </> : <p className="mt-1 text-sm text-amber-200">No valid recipients are available to preview.</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPreviewRecipientIndex((current) => Math.max(0, current - 1))} disabled={!previewRow || boundedPreviewIndex === 0} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                    <button type="button" onClick={() => setPreviewRecipientIndex((current) => Math.min(previewRows.length - 1, current + 1))} disabled={!previewRow || boundedPreviewIndex >= previewRows.length - 1} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                  </div>
                </div>
                {previewRow ? <>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Subject</p>
                  <p className="mt-1 text-sm text-white">{previewRow.subject || "-"}</p>
                  {!previewRow.ready ? <div role="alert" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Cannot render this recipient: {previewRow.problems.join("; ")}</div> : null}
                  {problemRows.length ? <div role="alert" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Warning: {problemRows.length} audience recipient{problemRows.length === 1 ? "" : "s"} cannot be rendered and will not be sent broken content.</div> : null}
                  <iframe title="Rendered bulk recipient email preview" srcDoc={previewRow.renderedEmail.html} className="mt-4 h-[680px] w-full rounded-xl border border-white/10 bg-white" sandbox="" />
                </> : null}
              </section>
              </div>
            ) : (
              <div className="grid gap-5">
                <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-bold">Smart Data / Final Preview</h3>
                  <p className="mt-2 text-xs text-slate-400">Available: {EMAIL_CENTER_MERGE_FIELDS.map((field) => `{{${field}}}`).join(", ")}</p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Subject</p>
                  <p className="mt-1 text-sm text-white">{renderedSubject || "-"}</p>
                  <iframe title="Rendered email preview" srcDoc={renderedEmail.html} className="mt-4 h-[680px] w-full rounded-xl border border-white/10 bg-white" sandbox="" />
                </section>
                <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-bold">Pre-Send Check</h3>
                  <div className="mt-3 grid gap-2">{checks.map((check) => <p key={check.label} className={`text-sm ${check.ok ? "text-emerald-300" : "text-amber-300"}`}>{check.ok ? "OK" : "Warning:"} {check.ok ? check.label : check.issue}</p>)}</div>
                  <p className={`mt-4 rounded-xl px-3 py-2 font-bold ${ready ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>{ready ? "Ready to Send" : "Review items above"}</p>
                </section>
              </div>
            )}
              </div>
            </div>
            {bulkProgress ? <div className="rounded-xl bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{bulkProgress}</div> : null}
            {resultMessage ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${resultTone === "success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>{resultMessage}</div> : null}
            <div className="flex flex-wrap items-end gap-3">
              <button type="submit" disabled={isSending || (usesAudienceRecipients ? !selectedReadyRows.length : !ready)} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:bg-slate-700 sm:w-fit sm:min-w-44">{isSending ? (usesAudienceRecipients ? `Sending ${selectedReadyRows.length} emails...` : "Sending...") : usesAudienceRecipients ? `SEND NOW — ${selectedReadyRows.length} EMAILS` : "Send Email"}</button>
              {usesAudienceRecipients ? <>
                <label className="grid gap-1 text-xs font-bold text-slate-300">Send date (Eastern)
                  <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="min-h-12 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm text-white" />
                </label>
                <button type="button" onClick={() => void scheduleBulkCampaign()} disabled={isSending || !selectedReadyRows.length || !scheduleDate} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400/40 px-5 py-3 font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">Schedule Send</button>
                <p className="w-full text-xs text-slate-400">StageFlow runs scheduled email once daily at the production cron opportunity. The exact expected time is shown before approval. Recipients will be re-evaluated at send time.</p>
              </> : null}
            </div>
          </form>
        </section> : null}

        {activeSection === "templates" ? <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7"><h2 className="text-xl font-black">Templates</h2><p className="mt-1 text-sm text-slate-400">Choose an existing template, then continue composing with editable fields.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{manualEmailTemplates.map((template) => <button key={template.key} type="button" onClick={() => { handleTemplateChange(template.key); chooseSection("compose"); }} className={`rounded-2xl border p-4 text-left ${templateKey === template.key ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:bg-white/[0.06]"}`}><strong className="text-white">{template.label}</strong><p className="mt-1 text-xs text-slate-400">{template.subject || "Custom subject and message"}</p></button>)}</div></section> : null}

        {activeSection === "discount-codes" ? <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7"><h2 className="text-xl font-black">Discount Codes</h2><p className="mt-1 text-sm text-slate-400">Manage reusable promotions or select one to populate the current compose draft.</p><SavedDiscountCodes slug={slug} onSelect={selectSavedDiscountCode} /></section> : null}

        {activeSection === "sent" ? <ScheduledEmailCampaigns slug={slug} /> : null}

        {activeSection === "sent" ? <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
          <h2 className="text-xl font-black">Bulk Sends / Campaigns</h2>
          <p className="mt-1 text-sm text-slate-400">Counts come from exact linked delivery rows.</p>
          <div className="mt-5 grid gap-3">
            {bulkOperations.length ? bulkOperations.map((operation) => {
              const deliveries = bulkDeliveries.filter((delivery) => delivery.bulk_operation_id === operation.id);
              const analytics = buildCampaignAnalytics(deliveries);
              return <details key={operation.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer list-none"><div className="grid gap-2 sm:grid-cols-[2fr_auto_auto]">
                  <div><strong>{templateLabels[operation.template_key] ?? operation.template_key}</strong><p className="text-sm text-slate-300">{operation.audience_label} - {operation.selected_recipient_count} recipients</p></div>
                  <span className="text-xs text-slate-400">{formatDateTime(operation.completed_at || operation.created_at)}</span>
                  <span className={`w-fit rounded-full border px-2 py-1 text-xs font-bold ${statusTone(operation.failed_count ? "failed" : "delivered")}`}>{operation.sent_count} accepted - {operation.failed_count} failed</span>
                </div></summary>
                <p className="mt-3 text-sm">Delivered {analytics.delivered} - Opened {analytics.opened} - Clicked {analytics.clicked} - Problems {analytics.problems}</p>
                <CampaignAnalyticsPanel deliveries={deliveries} />
                <div className="mt-3 grid gap-2">{deliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
                  <span><strong>{delivery.recipient_name || delivery.recipient_email}</strong><span className="ml-2 text-slate-400">{delivery.recipient_email}</span></span>
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusTone(delivery.current_status)}`}>{statusLabel(delivery.current_status)}</span>
                </div>)}</div>
              </details>;
            }) : <p className="text-sm text-slate-400">No bulk sends yet.</p>}
          </div>
        </section> : null}

        {activeSection === "sent" ? <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
          <h2 className="text-xl font-black">Recent Emails</h2><p className="mt-1 text-sm text-slate-400">Immutable message snapshots and Resend delivery activity for this show.</p>
          <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search recipient, email, subject, or activity type" className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" />
          <div className="mt-4 flex flex-wrap gap-2">{(["all","sent","delivered","opened","clicked","problems"] as HistoryFilter[]).map((filter) => <button key={filter} type="button" onClick={() => setHistoryFilter(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${historyFilter === filter ? "border-emerald-400 bg-emerald-500/20 text-emerald-100" : "border-white/15 text-slate-300"}`}>{filter}</button>)}</div>
          {isLoading ? <p className="mt-5 text-sm text-slate-400">Loading Email Center...</p> : null}
          {loadError ? <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{loadError}</p> : null}
          {!isLoading && !loadError && filteredHistory.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-slate-400">No emails match this filter.</p> : null}
          <div className="mt-5 grid gap-3">{filteredHistory.map((item) => <details key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer list-none">
              <div className="grid gap-2 sm:grid-cols-[1.2fr_2fr_auto_auto] sm:items-center">
                <div><p className="font-bold text-white">{item.recipientName || item.recipientEmail}</p><p className="text-xs text-slate-400">{item.recipientEmail}</p><p className="mt-1 text-[0.68rem] font-bold uppercase tracking-wider text-amber-200">{item.displayType}</p></div>
                <p className="text-sm text-slate-200">{item.subject}</p><p className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${statusTone(item.currentStatus)}`}>{statusLabel(item.currentStatus)}'</span>
              </div>
            </summary>
            <div className="mt-4 grid gap-5 border-t border-white/10 pt-4 lg:grid-cols-2">
              <div className="grid gap-2 text-sm"><h3 className="font-bold uppercase tracking-wider text-slate-400">Message Details</h3>
                <p><span className="text-slate-400">To:</span> {item.recipientName ? `${item.recipientName} <${item.recipientEmail}>` : item.recipientEmail}</p>
                <p><span className="text-slate-400">From:</span> {item.fromAddress}</p><p><span className="text-slate-400">Reply-To:</span> {item.replyTo || ""}</p>
                <p><span className="text-slate-400">Type:</span> {item.displayType}</p><p><span className="text-slate-400">Template:</span> {templateLabels[item.templateKey] ?? item.templateKey}</p>
                <p><span className="text-slate-400">Subject:</span> {item.subject}</p><p><span className="text-slate-400">Sent:</span> {formatDateTime(item.sentAt)}</p>
                <p><span className="text-slate-400">Resend ID:</span> {item.resendMessageId || ""}</p>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 font-sans text-sm leading-6">{item.message || (item.activityType === "automatic_presale" ? "Automatic presale body snapshot was not stored for this delivery." : "Historical message body unavailable.")}</pre>
              </div>
              <div><h3 className="font-bold uppercase tracking-wider text-slate-400">Email Activity</h3>
                <ol className="mt-3 grid gap-3 text-sm"><li><span className="text-slate-400">{formatDateTime(item.createdAt)}</span>  Email created</li>
                  {item.sentAt ? <li><span className="text-slate-400">{formatDateTime(item.sentAt)}</span>  Sent to Resend</li> : null}
                  {item.events.map((event) => <li key={event.id}><span className="text-slate-400">{formatDateTime(event.createdAt)}</span>  {eventLabel(event.type)}
                    {event.clickedUrl ? <p className="break-all text-xs text-cyan-300">{event.clickedUrl}</p> : null}
                    {event.detail ? <p className="text-xs text-rose-200">{event.detail}</p> : null}</li>)}
                  {item.errorMessage ? <li className="text-rose-200">{item.errorMessage}</li> : null}
                </ol>
              </div>
            </div>
          </details>)}</div>
        </section> : null}
      </div>
    </main>
  );
}

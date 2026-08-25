"use client";

import { useEffect, useMemo, useState } from "react";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { resolveEmailCenterMergeFields, type EmailCenterMergeValues } from "@/lib/email-center";
import { formatEmailCenterSaleDate, withPresaleGreetingFallback } from "@/lib/email-center-presale";

type Campaign = {
  id: string; template_key: string; audience_label: string; subject_template: string; heading_template: string;
  message_template: string; cta_label_template: string; cta_url_template: string; show_name_snapshot: string;
  show_date_snapshot: string | null; presale_starts_at_snapshot: string; public_sale_starts_at_snapshot: string | null;
  ticket_url_snapshot: string; scheduled_for: string; status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  recipient_count_at_schedule: number; final_recipient_count: number | null; error_message: string | null;
};
type Recipient = { id: string; name: string; email: string; source: string };
type Draft = { showName: string; showDate: string | null; scheduledFor: string | null; subject: string; ticketUrl: string | null; valid: boolean; problem: string | null };

function dateTime(value: string | null) { if (!value) return "Not configured"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(parsed); }
function showDate(value: string | null) { if (!value) return "Date not configured"; const parsed = new Date(`${value}T12:00:00`); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(parsed); }
function statusClass(status: Campaign["status"]) { if (status === "completed") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"; if (status === "failed" || status === "cancelled") return "border-rose-400/40 bg-rose-500/15 text-rose-100"; if (status === "processing") return "border-sky-400/40 bg-sky-500/15 text-sky-100"; return "border-amber-400/40 bg-amber-500/15 text-amber-100"; }
function nextDailySchedulerRun(presaleStartsAt: string) {
  const presale = new Date(presaleStartsAt);
  const threshold = Math.max(Date.now(), presale.getTime());
  const candidate = new Date(threshold);
  candidate.setUTCHours(4, 15, 0, 0);
  if (candidate.getTime() < threshold) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
}

export function ScheduledEmailCampaigns({ slug }: { slug: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fallbackPreview, setFallbackPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const response = await fetch(`/api/admin/email-center/scheduled?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const payload = await response.json() as { success?: boolean; error?: string; campaign?: Campaign | null; recipients?: Recipient[]; currentRecipientCount?: number; draft?: Draft };
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load scheduled emails.");
    setCampaign(payload.campaign ?? null); setRecipients(payload.recipients ?? []); setRecipientCount(payload.currentRecipientCount ?? 0); setDraft(payload.draft ?? null);
  }
  useEffect(() => { let active = true; void load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load scheduled emails."); }); return () => { active = false; }; }, [slug]);
  const preview = useMemo(() => {
    if (!campaign) return null;
    const firstName = fallbackPreview ? "" : recipients[0]?.name.split(/\s+/)[0] ?? "";
    const fields = withPresaleGreetingFallback({ first_name: firstName, show_name: campaign.show_name_snapshot, show_date: showDate(campaign.show_date_snapshot), presale_start: formatEmailCenterSaleDate(campaign.presale_starts_at_snapshot), public_sale_start: formatEmailCenterSaleDate(campaign.public_sale_starts_at_snapshot), ticket_link: campaign.ticket_url_snapshot } satisfies EmailCenterMergeValues);
    return { subject: resolveEmailCenterMergeFields(campaign.subject_template, fields).rendered, html: renderEmailCenterEmail({ heading: resolveEmailCenterMergeFields(campaign.heading_template, fields).rendered, message: resolveEmailCenterMergeFields(campaign.message_template, fields).rendered, ctaLabel: resolveEmailCenterMergeFields(campaign.cta_label_template, fields).rendered, ctaUrl: resolveEmailCenterMergeFields(campaign.cta_url_template, fields).rendered, unsubscribeUrl: "https://stageflow.cumberlandmountainmusic.com/mailing-list/unsubscribe?token=recipient-specific-secure-link" }).html };
  }, [campaign, fallbackPreview, recipients]);
  async function schedule() {
    if (!draft?.valid) return;
    const summary = [`Show: ${draft.showName} - ${showDate(draft.showDate)}`, `Send: ${dateTime(draft.scheduledFor)}`, "Audience: Mailing List Subscribers", `Currently Eligible: ${recipientCount}`, `Subject: ${draft.subject}`, "Template: Presale / Early Access", "CTA: Ticket link from Show Details", "", "Schedule this campaign?"];
    if (!window.confirm(summary.join("\n"))) return;
    setBusy(true); setError(null);
    try { const response = await fetch("/api/admin/email-center/scheduled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) }); const payload = await response.json() as { success?: boolean; error?: string; campaign?: Campaign }; if (!response.ok || !payload.success || !payload.campaign) throw new Error(payload.error || "Unable to schedule this campaign."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to schedule this campaign."); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!campaign || campaign.status !== "scheduled" || !window.confirm("Cancel this scheduled send? Its history record will be preserved.")) return;
    setBusy(true); setError(null);
    try { const response = await fetch("/api/admin/email-center/scheduled", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, campaignId: campaign.id }) }); const payload = await response.json() as { success?: boolean; error?: string }; if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to cancel this campaign."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to cancel this campaign."); } finally { setBusy(false); }
  }
  async function sendNow() {
    if (!campaign || campaign.status !== "scheduled" || Date.now() < new Date(campaign.scheduled_for).getTime()) return;
    if (!window.confirm(`SEND NOW will re-evaluate the current Mailing List and send the approved scheduled snapshot for ${campaign.show_name_snapshot}. Continue?`)) return;
    setBusy(true); setError(null);
    try { const response = await fetch("/api/admin/email-center/scheduled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, action: "send_now", campaignId: campaign.id }) }); const payload = await response.json() as { success?: boolean; error?: string }; if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send this campaign now."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send this campaign now."); } finally { setBusy(false); }
  }
  const activeCount = campaign && ["scheduled", "processing"].includes(campaign.status) ? 1 : 0;
  return <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Scheduled Emails{activeCount ? ` (${activeCount})` : ""}</h2><p className="mt-1 text-sm text-slate-400">Approved campaigns waiting for their show’s presale opening.</p></div>
      {!campaign || ["failed", "cancelled"].includes(campaign.status) ? <button type="button" disabled={busy || !draft?.valid} onClick={() => void schedule()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:bg-slate-700">{busy ? "Working..." : "Schedule Presale Email"}</button> : null}</div>
    {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
    {!campaign && draft?.problem ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{draft.problem}</p> : null}
    {!campaign ? <p className="mt-4 text-sm text-slate-400">No presale campaign is scheduled for this show.</p> : <article className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="grid gap-3 md:grid-cols-[2fr_1.3fr_auto]"><div><h3 className="font-black">Presale / Early Access — {showDate(campaign.show_date_snapshot)}</h3><p className="mt-1 text-sm text-slate-300">{campaign.show_name_snapshot}</p></div><div className="text-sm"><p><span className="text-slate-400">Presale opens:</span> {dateTime(campaign.scheduled_for)}</p><p><span className="text-slate-400">Automatic email:</span> {dateTime(nextDailySchedulerRun(campaign.scheduled_for))}</p><p><span className="text-slate-400">Audience:</span> {campaign.audience_label}</p><p><span className="text-slate-400">Currently Eligible:</span> {recipientCount}</p></div><span className={`h-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(campaign.status)}`}>{campaign.status === "processing" ? "Sending" : campaign.status === "completed" ? "Sent" : campaign.status}</span></div>
      <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-100">Vercel Hobby runs this scheduler once daily. The automatic email may send after the exact presale opening time; if the daily run has passed, it remains Scheduled until the next daily run.</p>
      <p className="mt-3 text-xs text-slate-400">Final recipients are re-evaluated at send time to respect new subscriptions and unsubscribes.</p>{campaign.error_message ? <p className="mt-3 text-sm text-rose-200">{campaign.error_message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">{campaign.status === "scheduled" ? <><button type="button" disabled={busy || Date.now() < new Date(campaign.scheduled_for).getTime()} onClick={() => void sendNow()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:bg-slate-700">Send Now</button><button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-100">Cancel Scheduled Send</button></> : null}</div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2"><details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer font-bold">View Recipients ({recipientCount})</summary><div className="mt-3 max-h-80 overflow-y-auto">{recipients.map((recipient) => <div key={recipient.id} className="border-t border-white/10 py-2 text-sm"><strong>{recipient.name || "Unnamed subscriber"}</strong><p className="break-all text-xs text-slate-300">{recipient.email}</p><p className="text-xs text-slate-500">{recipient.source}</p></div>)}</div></details>
        <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer font-bold">Preview Scheduled Email</summary>{preview ? <div className="mt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm"><span className="text-slate-400">Subject:</span> {preview.subject}</p><button type="button" onClick={() => setFallbackPreview((value) => !value)} className="rounded-lg border border-white/15 px-2 py-1 text-xs">{fallbackPreview ? "Preview named greeting" : "Preview Hi there fallback"}</button></div><p className="mt-2 break-all text-xs text-slate-400">CTA destination: {campaign.ticket_url_snapshot}</p><iframe title="Scheduled email preview" srcDoc={preview.html} sandbox="" className="mt-3 h-[620px] w-full rounded-lg bg-white" /></div> : null}</details></div>
    </article>}
  </section>;
}

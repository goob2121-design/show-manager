"use client";

import { useCallback, useEffect, useState } from "react";

type Campaign = {
  id: string; template_key: string; audience_key: string; audience_label: string; subject_template: string;
  scheduled_for: string; status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  recipient_count_at_schedule: number; final_recipient_count: number | null; delivery_trigger: "automatic" | "manual" | null;
  manually_sent_at: string | null; completed_at: string | null; error_message: string | null;
};
type CampaignAudience = { recipients: Array<{ id: string; name: string; email: string }>; preview: { subject: string; html: string } | null };

function dateTime(value: string | null) { if (!value) return "Not available"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York", timeZoneName: "short" }).format(parsed); }

export function GeneralScheduledEmailCampaigns({ slug }: { slug: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiences, setAudiences] = useState<Record<string, CampaignAudience>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/email-center/scheduled-general?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const payload = await response.json() as { success?: boolean; error?: string; campaigns?: Campaign[]; campaignAudiences?: Record<string, CampaignAudience> };
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load scheduled campaigns.");
    setCampaigns(payload.campaigns ?? []); setAudiences(payload.campaignAudiences ?? {});
  }, [slug]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load scheduled campaigns.")); const listener = () => void load(); window.addEventListener("email-center-scheduled", listener); return () => window.removeEventListener("email-center-scheduled", listener); }, [load]);
  async function action(campaign: Campaign, kind: "send_now" | "cancel") {
    const prompt = kind === "send_now" ? "Send this scheduled campaign now? Current eligible recipients will be re-evaluated." : "Cancel this scheduled send? Its audit record will remain.";
    if (!window.confirm(prompt)) return;
    setBusyId(campaign.id); setError(null);
    try {
      const response = await fetch("/api/admin/email-center/scheduled-general", { method: kind === "cancel" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, campaignId: campaign.id, action: kind }) });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to update this campaign.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update this campaign."); } finally { setBusyId(null); }
  }
  return <section className="mt-5 border-t border-white/10 pt-5">
    <h3 className="font-black">General Scheduled Campaigns</h3>
    <p className="mt-1 text-sm text-slate-400">Recipients are re-evaluated from current authoritative audience data when delivery is claimed.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : null}
    <div className="mt-4 grid gap-3">{campaigns.length ? campaigns.map((campaign) => <article key={campaign.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{campaign.subject_template}</strong><p className="text-sm text-slate-300">{campaign.audience_label} · {campaign.template_key}</p></div><span className="rounded-full border border-white/15 px-2 py-1 text-xs font-bold uppercase">{campaign.status === "completed" ? "Completed" : campaign.status}</span></div>
      <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2"><p><span className="text-slate-400">Expected send:</span> {dateTime(campaign.scheduled_for)}</p><p><span className="text-slate-400">Currently eligible:</span> {audiences[campaign.id]?.recipients.length ?? 0}</p>{campaign.status === "completed" ? <p><span className="text-slate-400">{campaign.delivery_trigger === "manual" ? "Sent manually:" : "Sent automatically:"}</span> {dateTime(campaign.delivery_trigger === "manual" ? campaign.manually_sent_at : campaign.completed_at)}</p> : null}<p><span className="text-slate-400">Eligible at approval:</span> {campaign.recipient_count_at_schedule}</p></div>
      {campaign.error_message ? <p className="mt-2 text-sm text-rose-200">{campaign.error_message}</p> : null}
      {campaign.status === "scheduled" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busyId === campaign.id} onClick={() => void action(campaign, "send_now")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold disabled:bg-slate-700">Send Now</button><button type="button" disabled={busyId === campaign.id} onClick={() => void action(campaign, "cancel")} className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-100">Cancel Scheduled Send</button></div> : null}
      <div className="mt-3 grid gap-2 lg:grid-cols-2"><details className="rounded-lg border border-white/15 p-3 text-xs"><summary className="cursor-pointer font-bold">View Recipients ({audiences[campaign.id]?.recipients.length ?? 0})</summary><div className="mt-2 max-h-64 overflow-y-auto">{audiences[campaign.id]?.recipients.map((recipient) => <p key={recipient.id} className="border-t border-white/10 py-2"><strong>{recipient.name || "Unnamed contact"}</strong><span className="block break-all text-slate-300">{recipient.email}</span></p>)}</div><p className="mt-2 text-slate-400">Recipients will be re-evaluated at send time.</p></details>
        <details className="rounded-lg border border-white/15 p-3 text-xs"><summary className="cursor-pointer font-bold">Preview</summary>{audiences[campaign.id]?.preview ? <><p className="mt-2"><span className="text-slate-400">Subject:</span> {audiences[campaign.id].preview?.subject}</p><iframe title={`Scheduled campaign preview ${campaign.id}`} srcDoc={audiences[campaign.id].preview?.html} sandbox="" className="mt-2 h-[520px] w-full rounded-lg bg-white" /></> : <p className="mt-2 text-amber-200">No current recipient can render this campaign.</p>}</details></div>
    </article>) : <p className="text-sm text-slate-400">No general campaigns have been scheduled for this show.</p>}</div>
  </section>;
}

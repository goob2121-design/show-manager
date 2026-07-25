"use client";

import { useMemo, useState } from "react";
import type { AdmissionsPreviewClassification, AdmissionsPreviewDetail, AdmissionsSyncPreviewResult } from "@/lib/admissions-sync-preview";
import {
  CHECK_IN_PREVIEW_FILTERS,
  CHECK_IN_PREVIEW_READ_ONLY_MESSAGE,
  CHECK_IN_PREVIEW_READ_ONLY_TITLE,
  buildActionTotals,
  buildDestinationTotals,
  destinationLabel,
  filterPreviewDetails,
  humanStatus,
  humanStatusLabel,
  sumPreviewQuantity,
  type CheckInPreviewFilter,
  type CheckInPreviewHumanStatus,
} from "@/lib/admissions-sync-preview-presentation";
import type { PrepareCheckInListResult } from "@/lib/prepare-check-in-list";

type AdmissionsSyncPreviewPanelProps = {
  showId: string;
  showSlug: string;
  onPrepared?: () => void | Promise<void>;
};

function formatClassification(value: AdmissionsPreviewClassification) {
  if (value === "paid_reserved_link_missing_projection") return "Paid Reserved";
  if (value === "complimentary_reserved_link_missing_projection") return "Complimentary Reserved";
  if (value === "guest_comp") return "Guest Comp";
  if (value === "band_comp") return "Band Comp";
  if (value === "media_comp") return "Media / Press";
  if (value === "volunteer_comp") return "Volunteer";
  if (value === "staff_comp") return "Staff";
  if (value === "other_comp") return "Other";
  if (value === "sponsor_admission_native_check_in") return "Sponsor Comp";
  if (value === "ambiguous_source_ownership") return "Unclassified Admission";
  return "Existing Ticket Entry";
}

function statusClass(value: CheckInPreviewHumanStatus) {
  if (value === "ready_to_add") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "already_present") return "border-sky-200 bg-sky-50 text-sky-800";
  if (value === "already_handled") return "border-stone-200 bg-stone-100 text-stone-700";
  if (value === "needs_review") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function PreviewRow({ item }: { item: AdmissionsPreviewDetail }) {
  const status = humanStatus(item);
  const quantityLabel = item.classification === "paid_reserved_link_missing_projection" ? "Seats" : "Quantity";
  return (
    <article className="grid gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4 text-sm lg:grid-cols-[minmax(14rem,1.2fr)_12rem_10rem_minmax(15rem,1fr)]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Name / Admission</p>
        <h5 className="mt-1 text-base font-semibold text-stone-950">{item.displayLabel}</h5>
        <p className="mt-1 font-medium text-stone-700">{formatClassification(item.classification)}</p>
        <p className="mt-1 text-xs font-semibold text-sky-800">Destination: {destinationLabel(item.destinationGroup)}</p>
        {item.quantity !== null ? <p className="mt-1 text-xs text-stone-600">{quantityLabel}: {item.quantity}</p> : null}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Status</p>
        <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{humanStatusLabel(status)}</span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Source</p>
        <p className="mt-1 capitalize text-stone-700">{item.sourceType.replaceAll("_", " ")}</p>
        <p className="mt-1 font-mono text-xs text-stone-500">{item.maskedSourceIdentity}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Reason</p>
        <p className="mt-1 text-stone-600">{item.reason}</p>
      </div>
    </article>
  );
}

export function AdmissionsSyncPreviewPanel({ showId, showSlug, onPrepared }: AdmissionsSyncPreviewPanelProps) {
  const [preview, setPreview] = useState<AdmissionsSyncPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CheckInPreviewFilter>("all");
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareResult, setPrepareResult] = useState<PrepareCheckInListResult | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const visibleDetails = useMemo(() => filterPreviewDetails(preview?.details ?? [], activeFilter), [activeFilter, preview]);
  const readyDetails = useMemo(() => (preview?.details ?? []).filter((item) => humanStatus(item) === "ready_to_add"), [preview]);
  const destinationTotals = useMemo(() => buildDestinationTotals(preview?.details ?? []), [preview]);
  const actionTotals = useMemo(() => buildActionTotals(preview?.details ?? []), [preview]);

  async function loadPreview() {
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/admissions-sync-preview?slug=${encodeURIComponent(showSlug)}`, { method: "GET", cache: "no-store" });
      const payload = await response.json() as { success?: boolean; preview?: AdmissionsSyncPreviewResult; error?: string };
      if (!response.ok || !payload.success || !payload.preview) throw new Error(payload.error || "Unable to preview the check-in list.");
      setPreview(payload.preview);
      setActiveFilter("all");
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "Unable to preview the check-in list.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handlePrepare() {
    if (isPreparing) return;
    setIsPreparing(true);
    setPrepareError(null);
    try {
      const response = await fetch(`/api/admin/shows/${encodeURIComponent(showId)}/prepare-check-in-list`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: showSlug }),
      });
      const payload = await response.json() as { success?: boolean; result?: PrepareCheckInListResult; error?: string };
      if (!response.ok || !payload.success || !payload.result) throw new Error(payload.error || "Unable to prepare the check-in list.");
      setPrepareResult(payload.result);
      setIsConfirmationOpen(false);
      await onPrepared?.();
      await loadPreview();
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : "Unable to prepare the check-in list.");
    } finally {
      setIsPreparing(false);
    }
  }

  const sections = [
    { destination: "prepaid_online" as const, title: "Prepaid / Online Check-In" },
    { destination: "special_admissions" as const, title: "Special Admissions" },
    { destination: "needs_review" as const, title: "Needs Review" },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void loadPreview()} disabled={isPreviewLoading || isPreparing} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">
          {isPreviewLoading ? "Building Preview..." : "Preview Check-In List"}
        </button>
        <button type="button" onClick={() => setIsConfirmationOpen(true)} disabled={!preview || readyDetails.length === 0 || isPreviewLoading || isPreparing} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300">
          {isPreparing ? "Preparing..." : "Prepare Check-In List"}
        </button>
      </div>

      {previewError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{previewError}</p> : null}
      {prepareError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{prepareError}</p> : null}
      {prepareResult ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Check-in list preparation complete.</p>
          <p className="mt-1">Added {prepareResult.added} · Already present {prepareResult.alreadyPresent} · Already handled {prepareResult.alreadyHandled} · Skipped {prepareResult.skipped} · Errors {prepareResult.errors}</p>
        </div>
      ) : null}

      {preview ? (
        <section className="grid gap-5 rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5">
          <div className="rounded-2xl border-2 border-sky-300 bg-white px-4 py-4 shadow-sm">
            <p className="text-sm font-black tracking-[0.16em] text-sky-900">{CHECK_IN_PREVIEW_READ_ONLY_TITLE}</p>
            <p className="mt-1 font-semibold text-stone-900">{CHECK_IN_PREVIEW_READ_ONLY_MESSAGE}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">This preview does not modify Square purchases, ticket records, reserved-seat links, seat assignments, sponsor allowances, check-in status, or emails. No database writes are performed.</p>
          </div>
          <div><h4 className="text-lg font-semibold text-stone-950">Preview Check-In List</h4><p className="text-sm text-stone-600">See where admissions belong and what Prepare Check-In List will do.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[["Prepaid / Online", destinationTotals.prepaidOnline], ["Special Admissions", destinationTotals.specialAdmissions], ["Sponsor-native", destinationTotals.sponsorNative], ["Paid Door-native", destinationTotals.paidDoorNative], ["Needs Review", destinationTotals.needsReview]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-stone-200 bg-white px-3 py-3"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</p><p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[["Ready to Add", actionTotals.readyToAdd], ["Already Present", actionTotals.alreadyPresent], ["Already Handled", actionTotals.alreadyHandled], ["Needs Review", actionTotals.needsReview], ["Errors", actionTotals.errors]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"><p className="text-xs font-semibold text-stone-600">{label}</p><p className="text-lg font-semibold text-stone-900">{value}</p></div>)}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Preview filters">{CHECK_IN_PREVIEW_FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setActiveFilter(filter.value)} aria-pressed={activeFilter === filter.value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activeFilter === filter.value ? "border-sky-700 bg-sky-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}>{filter.label}</button>)}</div>
          {(activeFilter === "all" || activeFilter === "sponsor_native") && preview.details.some((item) => item.destinationGroup === "sponsor_native") ? <div className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-3"><p className="font-semibold text-stone-900">Sponsor Comp Check-In</p><p className="text-sm text-stone-600">Already handled by Sponsor Comp Check-In · {sumPreviewQuantity(preview.details.filter((item) => item.destinationGroup === "sponsor_native"))} admission(s)</p></div> : null}
          {(activeFilter === "all" || activeFilter === "door_sale_native") && preview.details.some((item) => item.destinationGroup === "door_sale_native") ? <div className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-3"><p className="font-semibold text-stone-900">Paid Door</p><p className="text-sm text-stone-600">Already handled by Paid Door controls · {sumPreviewQuantity(preview.details.filter((item) => item.destinationGroup === "door_sale_native"))} admission(s)</p></div> : null}
          {sections.map((section) => { const rows = visibleDetails.filter((item) => item.destinationGroup === section.destination); if (rows.length === 0) return null; return <section key={section.destination} className="grid gap-3"><div className="flex items-end justify-between gap-3"><h5 className="text-base font-semibold text-stone-950">{section.title}</h5><p className="text-xs font-medium text-stone-500">{sumPreviewQuantity(rows)} admission(s)</p></div>{rows.map((item, index) => <PreviewRow key={`${item.maskedSourceIdentity}-${index}`} item={item} />)}</section>; })}
          {visibleDetails.length === 0 && activeFilter !== "sponsor_native" && activeFilter !== "door_sale_native" ? <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-5 text-sm text-stone-500">No admissions match this filter.</p> : null}
        </section>
      ) : null}

      {isConfirmationOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="prepare-check-in-title" className="fixed inset-0 z-50 grid place-items-center bg-stone-950/60 p-4">
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <h3 id="prepare-check-in-title" className="text-xl font-semibold text-stone-950">Prepare Check-In List</h3>
            <p className="mt-3 font-medium text-stone-800">This will create missing check-in entries only.</p>
            <p className="mt-4 text-sm font-semibold text-stone-700">It will NOT:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600">
              <li>modify Square purchases</li><li>modify existing ticket records</li><li>modify reserved-seat links</li><li>modify selected seats</li><li>modify sponsor allowances</li><li>send emails</li>
            </ul>
            <h4 className="mt-5 font-semibold text-stone-900">The following entries are ready to be added:</h4>
            <div className="mt-3 grid gap-2">{readyDetails.map((item) => <div key={item.maskedSourceIdentity} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm"><p className="font-semibold text-stone-900">{item.displayLabel}</p><p className="text-stone-600">{formatClassification(item.classification)} · {item.quantity ?? 1} · {destinationLabel(item.destinationGroup)}</p></div>)}</div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsConfirmationOpen(false)} disabled={isPreparing} className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void handlePrepare()} disabled={isPreparing} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:bg-emerald-400">{isPreparing ? "Preparing..." : "Prepare Check-In List"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

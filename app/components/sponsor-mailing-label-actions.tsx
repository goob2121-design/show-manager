"use client";

import { useEffect, useMemo, useState } from "react";
import type { SponsorLibraryEntry } from "@/lib/types";
import {
  buildCmmsReturnAddressLabels,
  buildSponsorMailingLabelPrintHtml,
  CMMS_MAILING_LABEL_LOGO_PATH,
  formatSponsorMailingLabel,
  hasUsableSponsorMailingAddress,
  selectBulkSponsorMailingLabels,
} from "@/lib/sponsor-mailing-labels";
import { sponsorRecognitionName } from "@/lib/sponsor-library";

function openMailingLabelPrintWindow(
  labels: NonNullable<ReturnType<typeof formatSponsorMailingLabel>>[],
  options: { title?: string; logoUrl?: string } = {},
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("The print window was blocked. Please allow pop-ups and try again.");
    return;
  }

  printWindow.onload = () => {
    window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 150);
  };
  printWindow.onafterprint = () => printWindow.close();
  printWindow.document.open();
  printWindow.document.write(buildSponsorMailingLabelPrintHtml(labels, options));
  printWindow.document.close();
}

export function SponsorMailingLabelButton({ sponsor }: { sponsor: SponsorLibraryEntry }) {
  const label = formatSponsorMailingLabel(sponsor);
  const enabled = hasUsableSponsorMailingAddress(sponsor) && Boolean(label);

  return <button
    type="button"
    onClick={() => label && openMailingLabelPrintWindow([label])}
    disabled={!enabled}
    title={enabled ? "Print this sponsor's mailing label" : "Complete Address Line 1, City, State, and ZIP / Postal Code to print a label."}
    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
  >
    Print Mailing Label
  </button>;
}

export function SponsorMailingLabelBulkAction({ sponsors }: { sponsors: SponsorLibraryEntry[] }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const selection = useMemo(() => selectBulkSponsorMailingLabels(sponsors), [sponsors]);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen]);

  return <>
    <button
      type="button"
      onClick={() => setIsPreviewOpen(true)}
      className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
    >
      Print Sponsor Mailing Labels
    </button>

    {isPreviewOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsPreviewOpen(false);
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby="sponsor-label-preview-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <h3 id="sponsor-label-preview-title" className="text-xl font-semibold text-stone-900">Sponsor Mailing Labels Preview</h3>
          <p className="mt-2 text-sm text-stone-600">Review the label set before opening the browser print dialog.</p>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-emerald-700">Labels</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{selection.included.length}</dd></div>
            <div className="rounded-xl bg-amber-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-amber-700">Incomplete</dt><dd className="mt-1 text-2xl font-bold text-amber-900">{selection.excludedIncomplete.length}</dd></div>
            <div className="rounded-xl bg-stone-100 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-stone-600">Archived</dt><dd className="mt-1 text-2xl font-bold text-stone-900">{selection.excludedArchived.length}</dd></div>
          </dl>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-semibold text-stone-900">Sponsors included</h4>
              {selection.included.length ? <ul className="mt-2 space-y-1 text-sm text-stone-700">{selection.included.map((label) => <li key={label.sponsorId}>{label.sponsorName}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">No printable sponsor addresses are available.</p>}
            </div>
            <div>
              <h4 className="font-semibold text-stone-900">Excluded: incomplete address</h4>
              {selection.excludedIncomplete.length ? <ul className="mt-2 space-y-1 text-sm text-stone-700">{selection.excludedIncomplete.map((sponsor) => <li key={sponsor.id}>{sponsorRecognitionName(sponsor)}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">None</p>}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setIsPreviewOpen(false)} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">Cancel</button>
            <button type="button" onClick={() => openMailingLabelPrintWindow(selection.included)} disabled={selection.included.length === 0} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300">Print {selection.included.length} {selection.included.length === 1 ? "Label" : "Labels"}</button>
          </div>
        </section>
      </div>
    ) : null}
  </>;
}
export function CmmsReturnMailingLabelActions() {
  const [includeLogo, setIncludeLogo] = useState(false);

  function printReturnLabels(count: 1 | 15) {
    openMailingLabelPrintWindow(buildCmmsReturnAddressLabels(count), {
      title: count === 1 ? "CMMS Return Address Label" : "CMMS Return Address Labels",
      logoUrl: includeLogo ? `${window.location.origin}${CMMS_MAILING_LABEL_LOGO_PATH}` : undefined,
    });
  }

  return <div className="flex flex-col gap-2 rounded-xl border border-stone-300 bg-white p-3">
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">CMMS return-label style</legend>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <input type="radio" name="cmms-return-label-style" checked={!includeLogo} onChange={() => setIncludeLogo(false)} className="h-4 w-4 text-emerald-700 focus:ring-emerald-600" />
        Text Only
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <input type="radio" name="cmms-return-label-style" checked={includeLogo} onChange={() => setIncludeLogo(true)} className="h-4 w-4 text-emerald-700 focus:ring-emerald-600" />
        Include CMMS Logo
      </label>
    </fieldset>
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button type="button" onClick={() => printReturnLabels(1)} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">
        Print One CMMS Return Address Label
      </button>
      <button type="button" onClick={() => printReturnLabels(15)} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">
        Print Full Sheet of CMMS Return Address Labels
      </button>
    </div>
  </div>;
}
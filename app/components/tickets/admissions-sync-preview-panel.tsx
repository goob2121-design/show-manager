"use client";

import { useState } from "react";
import type {
  AdmissionsPreviewClassification,
  AdmissionsPreviewDetail,
  AdmissionsSyncPreviewResult,
} from "@/lib/admissions-sync-preview";

type AdmissionsSyncPreviewPanelProps = {
  showId: string;
  showSlug: string;
};

function formatClassification(value: AdmissionsPreviewClassification) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusLabel(value: AdmissionsPreviewDetail["status"]) {
  if (value === "would_add") return "Would add";
  if (value === "already_present") return "Already present";
  if (value === "skipped") return "Skipped";
  return "Error";
}

export function AdmissionsSyncPreviewPanel({ showId, showSlug }: AdmissionsSyncPreviewPanelProps) {
  const [preview, setPreview] = useState<AdmissionsSyncPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  async function handlePreview() {
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await fetch(
        `/api/admin/shows/${encodeURIComponent(showId)}/admissions-sync-preview?slug=${encodeURIComponent(showSlug)}`,
        { method: "GET", cache: "no-store" },
      );
      const payload = await response.json() as {
        success?: boolean;
        preview?: AdmissionsSyncPreviewResult;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.preview) {
        throw new Error(payload.error || "Unable to preview admissions sync.");
      }
      setPreview(payload.preview);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "Unable to preview admissions sync.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={() => void handlePreview()}
        disabled={isPreviewLoading}
        className="inline-flex min-h-12 w-fit items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPreviewLoading ? "Previewing Admissions..." : "Preview Admissions Sync"}
      </button>

      {previewError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {previewError}
        </p>
      ) : null}

      {preview ? (
        <section className="grid gap-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
          <div>
            <h4 className="font-semibold text-stone-900">Admissions Sync Preview</h4>
            <p className="text-sm text-stone-600">Read-only preview. No admissions or seat records were changed.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Would add", value: preview.counts.wouldAdd },
              { label: "Already present", value: preview.counts.alreadyPresent },
              { label: "Skipped", value: preview.counts.skipped },
              { label: "Errors", value: preview.counts.errors },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">{item.value}</p>
              </div>
            ))}
          </div>
          <details className="rounded-xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-800">
              Show preview details ({preview.details.length})
            </summary>
            <div className="grid gap-2 border-t border-stone-200 p-3">
              {preview.details.map((item, index) => (
                <article
                  key={`${item.maskedSourceIdentity}-${index}`}
                  className="grid gap-3 rounded-lg bg-stone-50 px-3 py-3 text-sm lg:grid-cols-[minmax(13rem,1.2fr)_12rem_10rem_minmax(14rem,1fr)]"
                >
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Name / Admission</p>
                    <h5 className="mt-1 font-semibold text-stone-900">{item.displayLabel}</h5>
                    <p className="mt-1 text-xs text-stone-600">{formatClassification(item.classification)}</p>
                    {item.quantity !== null ? <p className="mt-1 text-xs font-medium text-stone-500">Quantity / seats: {item.quantity}</p> : null}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Source type</p>
                    <p className="mt-1 font-semibold capitalize text-stone-800">{item.sourceType.replaceAll("_", " ")}</p>
                    <p className="mt-1 font-mono text-xs text-stone-500">{item.maskedSourceIdentity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Status</p>
                    <p className="mt-1 font-semibold text-stone-800">{statusLabel(item.status)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Reason</p>
                    <p className="mt-1 text-stone-600">{item.reason}</p>
                  </div>
                </article>
              ))}
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}

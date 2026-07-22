"use client";

import { useState } from "react";

type CopyVariationIdButtonProps = {
  variationId: string;
};

export function CopyVariationIdButton({ variationId }: CopyVariationIdButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(variationId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
    >
      {copied ? "Copied" : "Copy Variation ID"}
    </button>
  );
}
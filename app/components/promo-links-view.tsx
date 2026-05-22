"use client";

import { useState } from "react";
import type { PromoLink } from "@/lib/types";

export function formatPromoLinkType(linkType: string | null | undefined) {
  switch (linkType) {
    case "facebook_event":
      return "Facebook Event";
    case "facebook_page":
      return "Facebook Page";
    case "ticket_link":
      return "Ticket Link";
    case "main_website":
      return "Main Website";
    case "youtube_promo_video":
      return "YouTube Promo Video";
    case "instagram":
      return "Instagram";
    case "sponsor_link":
      return "Sponsor Link";
    default:
      return "Other";
  }
}

type PromoLinksViewProps = {
  links: PromoLink[];
  emptyMessage?: string;
};

export function PromoLinksView({
  links,
  emptyMessage = "No promo links have been added yet.",
}: PromoLinksViewProps) {
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  async function handleCopyLink(url: string, linkId: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(linkId);
      window.setTimeout(() => {
        setCopiedLinkId((currentValue) => (currentValue === linkId ? null : currentValue));
      }, 1800);
    } catch {
      setCopiedLinkId(null);
    }
  }

  if (links.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {links.map((link) => (
        <article
          key={link.id}
          className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">
                {formatPromoLinkType(link.link_type)}
              </span>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-stone-900">{link.title}</h3>
              {link.description?.trim() ? (
                <p className="mt-2 text-sm leading-6 text-stone-600">{link.description}</p>
              ) : null}
            </div>

            <p className="break-all text-sm text-stone-500">{link.url}</p>
          </div>

          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Open Link
            </a>
            <button
              type="button"
              onClick={() => void handleCopyLink(link.url, link.id)}
              className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              {copiedLinkId === link.id ? "Copied" : "Copy Link"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

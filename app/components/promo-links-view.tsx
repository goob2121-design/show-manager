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
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {links.map((link) => (
        <article
          key={link.id}
          className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 transition hover:bg-stone-50 sm:px-5 last:border-b-0"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800">
                  {formatPromoLinkType(link.link_type)}
                </span>
              </div>

              <div className="min-w-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-base font-semibold text-stone-900 transition hover:text-emerald-700"
                >
                  <span className="truncate">{link.title}</span>
                  <span aria-hidden="true" className="text-sm text-stone-400">
                    ↗
                  </span>
                </a>
                <p className="mt-1 break-all text-sm text-stone-500">{link.url}</p>
              </div>

              {link.description?.trim() ? (
                <p className="text-sm leading-6 text-stone-600">{link.description}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 gap-2 sm:pl-4">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Open
              </a>
              <button
                type="button"
                onClick={() => void handleCopyLink(link.url, link.id)}
                className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                {copiedLinkId === link.id ? "Copied" : "Copy Link"}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

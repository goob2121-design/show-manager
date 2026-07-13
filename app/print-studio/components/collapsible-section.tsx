"use client";

import { useId, useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  badge,
  children,
  className = "",
  bodyClassName = "",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`rounded-lg border border-slate-700 bg-slate-900/80 shadow-xl shadow-black/20 ${className}`}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block text-base font-bold text-slate-100">{title}</span>
          {description ? <span className="mt-1 block text-sm text-slate-400">{description}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {badge ? <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-bold text-slate-300">{badge}</span> : null}
          <span className="text-lg font-black text-emerald-300" aria-hidden="true">{isOpen ? "-" : "+"}</span>
        </span>
      </button>
      <div id={contentId} hidden={!isOpen} className={`border-t border-slate-800 px-4 py-4 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

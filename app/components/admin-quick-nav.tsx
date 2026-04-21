"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getAdminAccessStorageKey } from "@/app/components/admin-gate";

type AdminQuickNavProps = {
  slug: string;
  currentView: "admin" | "band" | "guest";
};

const quickNavLinks = [
  { key: "dashboard", label: "Dashboard", href: "/shows" },
  { key: "admin", label: "Admin", href: (slug: string) => `/admin/${slug}` },
  { key: "band", label: "Band", href: (slug: string) => `/band/${slug}` },
  { key: "guest", label: "Guest", href: (slug: string) => `/guest/${slug}` },
] as const;

function subscribeToAdminAccess(callback: () => void) {
  window.addEventListener("focus", callback);
  window.addEventListener("pageshow", callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener("pageshow", callback);
    window.removeEventListener("storage", callback);
  };
}

export function AdminQuickNav({ slug, currentView }: AdminQuickNavProps) {
  const isVisible = useSyncExternalStore(
    subscribeToAdminAccess,
    () => window.sessionStorage.getItem(getAdminAccessStorageKey(slug)) === "granted",
    () => false,
  );

  if (!isVisible) {
    return null;
  }

  return (
    <nav
      aria-label="Admin quick navigation"
      className="print-hidden rounded-2xl border border-stone-200 bg-stone-50/90 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/70"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
        <span className="pr-1 uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
          Quick Nav
        </span>
        {quickNavLinks.map((link) => {
          const isActive = link.key === currentView;
          const href = typeof link.href === "string" ? link.href : link.href(slug);

          return (
            <Link
              key={link.key}
              href={href}
              className={`rounded-full px-3 py-1.5 transition ${
                isActive
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                  : "bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

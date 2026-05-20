"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clearAllAdminAccess,
  readAdminAccess,
  subscribeToAdminAccess,
} from "@/app/components/admin-gate";

type AdminQuickNavProps = {
  slug: string;
  currentView: "dashboard" | "admin" | "band" | "guest" | "mc";
  accessSlug?: string;
  timelineMessages?: string[];
};

const quickNavLinks = [
  { key: "dashboard", label: "Dashboard", href: "/shows" },
  { key: "admin", label: "Admin", href: (slug: string) => `/admin/${slug}` },
  { key: "mc", label: "MC", href: (slug: string) => `/mc/${slug}` },
  { key: "band", label: "Band", href: (slug: string) => `/band/${slug}` },
  { key: "guest", label: "Guest", href: (slug: string) => `/guest/${slug}` },
] as const;
const chartBuilderUrl = "https://charts.pinnaclestudiotn.com";
type ScannerConnectionState = "checking" | "online" | "offline";

export function AdminQuickNav({
  slug,
  currentView,
  accessSlug = slug,
  timelineMessages = [],
}: AdminQuickNavProps) {
  const isVisible = useSyncExternalStore(
    subscribeToAdminAccess,
    () => readAdminAccess(accessSlug),
    () => false,
  );
  const [connectionState, setConnectionState] = useState<ScannerConnectionState>("checking");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const updateConnectionState = (isOnline: boolean) => {
      clearReconnectTimer();

      if (!isOnline) {
        setConnectionState("offline");
        return;
      }

      setConnectionState((currentState) => (currentState === "online" ? "online" : "checking"));
      reconnectTimer = setTimeout(() => {
        setConnectionState("online");
      }, 900);
    };

    updateConnectionState(window.navigator.onLine);

    const handleOnline = () => updateConnectionState(true);
    const handleOffline = () => updateConnectionState(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearReconnectTimer();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function handleLogout() {
    clearAllAdminAccess();

    window.location.href = currentView === "dashboard" ? "/shows" : `/admin/${slug}`;
  }

  if (!isVisible) {
    return null;
  }

  const scannerLabel =
    connectionState === "offline"
      ? "Offline"
      : connectionState === "checking"
        ? "Checking"
        : "Online";
  const scannerDotClass =
    connectionState === "offline"
      ? "bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.55)]"
      : connectionState === "checking"
        ? "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.55)]"
        : "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]";

  return (
    <nav
      aria-label="Admin quick navigation"
      className="print-hidden rounded-2xl border border-stone-200 bg-stone-50/90 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/70"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
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
                    ? "border border-emerald-600 bg-emerald-700 text-white shadow-sm hover:bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-700 dark:text-white dark:hover:bg-emerald-600"
                    : "border border-stone-300 bg-white text-stone-700 shadow-sm hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <a
            href={chartBuilderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-stone-700 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            ChartBuilder
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-stone-700 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            Logout
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center xl:flex">
          {timelineMessages.length > 0 ? (
            <div className="stageflow-ticker group w-full">
              <div className="stageflow-ticker__viewport">
                <div className="stageflow-ticker__track group-hover:[animation-play-state:paused]">
                  {[...timelineMessages, ...timelineMessages].map((message, index) => (
                    <span key={`${message}-${index}`} className="stageflow-ticker__item">
                      {message}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-50/80 dark:border-white/10 dark:bg-slate-950/60">
            <span className={`h-2 w-2 rounded-full ${scannerDotClass}`} />
            <div
              className={`stageflow-scanner stageflow-scanner--${connectionState}`}
              aria-hidden="true"
            >
              <span className="stageflow-scanner__beam" />
            </div>
            <span>{scannerLabel}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

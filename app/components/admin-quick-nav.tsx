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
  currentView: "dashboard" | "admin" | "band" | "guest" | "mc" | "print-studio";
  accessSlug?: string;
  timelineMessages?: string[];
  staticLinksOnly?: boolean;
};

function NavIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
      {children}
    </span>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 8.5 10 3.5l6.5 5v7a1 1 0 0 1-1 1h-3.75v-4.5h-3.5V16.5H4.5a1 1 0 0 1-1-1v-7Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 2.75 15.75 5v4.8c0 3.7-2.25 6.05-5.75 7.45C6.5 15.85 4.25 13.5 4.25 9.8V5L10 2.75Z" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12.5 3.5v8.25a2.5 2.5 0 1 1-1.5-2.28V5.2l5-1.2v6.55a2.5 2.5 0 1 1-1.5-2.28V3.5l-2 .48Z" />
    </svg>
  );
}

function FileChartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 2.75h5.5L15.75 7v10.25a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.75V7h4.25M7.5 14.5l1.75-2 1.75 1.25 2.5-3" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 7V3.75h8V7M6.25 14.25H4.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4.25a1 1 0 0 1-1 1h-1.75" />
      <path d="M6.25 12.25h7.5v4h-7.5v-4ZM13.75 10.25h.01" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4.25H5.75a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1H8M11.5 6.25l3.75 3.75-3.75 3.75M15 10H8.25" />
    </svg>
  );
}

const quickNavLinks = [
  { key: "dashboard", label: "Dashboard", href: "/shows", icon: <HomeIcon /> },
  { key: "band", label: "Band", href: (slug: string) => `/band/${slug}`, icon: <MusicIcon />, requiresShow: true },
  { key: "print-studio", label: "Print Studio", href: "/print-studio", icon: <PrinterIcon /> },
] as const;
const chartBuilderUrl = "https://charts.pinnaclestudiotn.com";
type ScannerConnectionState = "checking" | "online" | "offline";

export function AdminQuickNav({
  slug,
  currentView,
  accessSlug = slug,
  timelineMessages = [],
  staticLinksOnly = false,
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

  async function handleLogout() {
    clearAllAdminAccess();
    try {
      await fetch(`/api/admin-session?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    } finally {
      window.location.href = "/";
    }
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
      className="print-hidden rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs font-medium text-stone-500 [-ms-overflow-style:none] [scrollbar-width:none] dark:text-stone-400 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
          <span className="pr-1 uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
            Quick Nav
          </span>
          {quickNavLinks.filter((link) => !staticLinksOnly || !("requiresShow" in link && link.requiresShow)).map((link) => {
            const isActive = link.key === currentView;
            const href = typeof link.href === "string" ? link.href : link.href(slug);

            return (
              <Link
                key={link.key}
                href={href}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 transition sm:min-h-0 sm:py-1.5 ${
                  isActive
                    ? "border border-emerald-300 bg-emerald-700 text-white shadow-sm hover:bg-emerald-600 dark:border-emerald-300 dark:bg-emerald-700 dark:text-white dark:hover:bg-emerald-600"
                    : "border border-stone-300 bg-white text-stone-700 shadow-sm hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`}
              >
                <NavIcon>{link.icon}</NavIcon>
                {link.label}
              </Link>
            );
          })}
          <a
            href={chartBuilderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-2 text-stone-700 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:min-h-0 sm:py-1.5"
          >
            <NavIcon><FileChartIcon /></NavIcon>
            ChartBuilder
          </a>
          <Link
            href={`/admin/${slug}`}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 transition sm:min-h-0 sm:py-1.5 ${
              currentView === "admin"
                ? "border border-emerald-300 bg-emerald-700 text-white shadow-sm hover:bg-emerald-600 dark:border-emerald-300 dark:bg-emerald-700 dark:text-white dark:hover:bg-emerald-600"
                : "border border-stone-300 bg-white text-stone-700 shadow-sm hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <NavIcon><ShieldIcon /></NavIcon>
            Admin
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-2 text-stone-700 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:min-h-0 sm:py-1.5"
          >
            <NavIcon><LogoutIcon /></NavIcon>
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
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-200 dark:border-white/10 dark:bg-slate-950/60">
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

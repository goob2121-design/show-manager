"use client";

import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type AdminGateProps = {
  slug: string;
  resourceLabel?: string;
  continueLabel?: string;
  children: ReactNode;
};

const ADMIN_ACCESS_GRANTED_VALUE = "granted";
const ADMIN_ACCESS_CHANGE_EVENT = "cmms-admin-access-change";

export function getAdminAccessStorageKey(slug: string) {
  return `cmms-admin-access:${slug}`;
}

export function readAdminAccess(slug: string) {
  const storageKey = getAdminAccessStorageKey(slug);
  const sessionValue = window.sessionStorage.getItem(storageKey);

  if (sessionValue === ADMIN_ACCESS_GRANTED_VALUE) {
    return true;
  }

  return window.localStorage.getItem(storageKey) === ADMIN_ACCESS_GRANTED_VALUE;
}

function dispatchAdminAccessChange(slug: string) {
  window.dispatchEvent(new CustomEvent(ADMIN_ACCESS_CHANGE_EVENT, { detail: { slug } }));
}

export function persistAdminAccess(slug: string) {
  const storageKey = getAdminAccessStorageKey(slug);

  window.sessionStorage.setItem(storageKey, ADMIN_ACCESS_GRANTED_VALUE);
  window.localStorage.setItem(storageKey, ADMIN_ACCESS_GRANTED_VALUE);
  dispatchAdminAccessChange(slug);
}

export function clearAdminAccess(slug: string) {
  const storageKey = getAdminAccessStorageKey(slug);

  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem(storageKey);
  dispatchAdminAccessChange(slug);
}

export function clearAllAdminAccess() {
  const storagePrefix = "cmms-admin-access:";
  const slugs = new Set<string>();

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);

    if (key?.startsWith(storagePrefix)) {
      slugs.add(key.slice(storagePrefix.length));
    }
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(storagePrefix)) {
      slugs.add(key.slice(storagePrefix.length));
    }
  }

  slugs.forEach((slug) => {
    clearAdminAccess(slug);
  });
}

export function subscribeToAdminAccess(callback: () => void) {
  window.addEventListener("focus", callback);
  window.addEventListener("pageshow", callback);
  window.addEventListener("storage", callback);
  window.addEventListener(ADMIN_ACCESS_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener("pageshow", callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener(ADMIN_ACCESS_CHANGE_EVENT, callback);
  };
}

export function AdminGate({
  slug,
  resourceLabel,
  continueLabel = "Continue to Admin Portal",
  children,
}: AdminGateProps) {
  // Add NEXT_PUBLIC_ADMIN_PASSWORD in .env.local to enable this simple admin gate.
  const expectedPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showLogo, setShowLogo] = useState(true);

  const isGateEnabled = useMemo(() => expectedPassword.trim().length > 0, [expectedPassword]);

  useEffect(() => {
    if (!isGateEnabled) {
      setIsAuthorized(true);
      setIsReady(true);
      return;
    }

    const syncAccessState = () => {
      setIsAuthorized(readAdminAccess(slug));
      setIsReady(true);
    };

    syncAccessState();

    return subscribeToAdminAccess(syncAccessState);
  }, [isGateEnabled, slug]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isGateEnabled) {
      setIsAuthorized(true);
      return;
    }

    if (password === expectedPassword) {
      persistAdminAccess(slug);
      setIsAuthorized(true);
      setErrorMessage(null);
      return;
    }

    setErrorMessage("That password was not correct. Please try again.");
  }

  if (!isReady) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-stone-950 px-4 py-10 text-slate-100 sm:px-6">
        <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.85)] backdrop-blur sm:p-8">
          <p className="text-sm font-medium text-slate-300">Checking admin access...</p>
        </section>
      </main>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-stone-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-2xl rounded-[2rem] border border-slate-800 bg-slate-900/92 p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.85)] backdrop-blur sm:p-10">
        <div className="flex flex-col gap-6 text-center">
          <header className="flex flex-col items-center gap-4">
            {showLogo ? (
              <div className="w-full max-w-[88%] overflow-visible sm:max-w-[480px]">
                <Image
                  src="/stageflow-logo-v2.png"
                  alt="StageFlow logo"
                  width={580}
                  height={290}
                  priority
                  className="h-auto w-full object-contain"
                  onError={() => setShowLogo(false)}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-400 sm:text-base">
                Run the show. Don’t chase it.
              </p>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Admin Access
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                StageFlow
              </h1>
              <p className="text-sm text-slate-400 sm:text-base">
                by Pinnacle Recording Studio
              </p>
              <p className="text-sm leading-6 text-slate-300 sm:text-base">
                Enter the admin password to continue.
              </p>
            </div>
          </header>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-900/60 bg-rose-950/50 px-4 py-3 text-left text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <form className="flex flex-col gap-4 text-left" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                placeholder="Enter admin password"
                required
              />
            </label>

            <button
              type="submit"
              className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              {continueLabel}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

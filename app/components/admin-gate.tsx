"use client";

import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/app/components/theme-toggle";

type AdminGateProps = {
  slug: string;
  resourceLabel?: string;
  continueLabel?: string;
  children: ReactNode;
};

export function getAdminAccessStorageKey(slug: string) {
  return `cmms-admin-access:${slug}`;
}

function readAdminAccess(slug: string) {
  const storageKey = getAdminAccessStorageKey(slug);
  const sessionValue = window.sessionStorage.getItem(storageKey);

  if (sessionValue === "granted") {
    return true;
  }

  return window.localStorage.getItem(storageKey) === "granted";
}

function persistAdminAccess(slug: string) {
  const storageKey = getAdminAccessStorageKey(slug);

  window.sessionStorage.setItem(storageKey, "granted");
  window.localStorage.setItem(storageKey, "granted");
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

    setIsAuthorized(readAdminAccess(slug));
    setIsReady(true);
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
      <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
        <section className="mx-auto w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-stone-600">Checking admin access...</p>
        </section>
      </main>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
      <section className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex flex-col gap-6 text-center">
          <div className="flex justify-center sm:justify-end">
            <ThemeToggle />
          </div>

          <header className="flex flex-col items-center gap-4">
            {showLogo ? (
              <Image
                src="/cmms-logo.png"
                alt="CMMS logo"
                width={144}
                height={144}
                priority
                className="h-auto w-full max-w-[112px] object-contain sm:max-w-[144px]"
                onError={() => setShowLogo(false)}
              />
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Admin Access
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
                Show Manager
              </h1>
              <p className="text-sm leading-6 text-stone-600 sm:text-base">
                Enter the admin password to continue.
              </p>
              <p className="text-xs leading-5 text-stone-500 sm:text-sm">
                This protects{" "}
                <span className="font-medium">{resourceLabel ?? `the admin portal for ${slug}`}</span>.
              </p>
            </div>
          </header>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <form className="flex flex-col gap-4 text-left" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
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

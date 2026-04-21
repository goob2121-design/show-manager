"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type AdminGateProps = {
  slug: string;
  resourceLabel?: string;
  continueLabel?: string;
  children: ReactNode;
};

function getStorageKey(slug: string) {
  return `cmms-admin-access:${slug}`;
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

  const isGateEnabled = useMemo(() => expectedPassword.trim().length > 0, [expectedPassword]);

  useEffect(() => {
    if (!isGateEnabled) {
      setIsAuthorized(true);
      setIsReady(true);
      return;
    }

    const storedValue = window.sessionStorage.getItem(getStorageKey(slug));
    setIsAuthorized(storedValue === "granted");
    setIsReady(true);
  }, [isGateEnabled, slug]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isGateEnabled) {
      setIsAuthorized(true);
      return;
    }

    if (password === expectedPassword) {
      window.sessionStorage.setItem(getStorageKey(slug), "granted");
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
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:px-6">
      <section className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Admin Access
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Enter Admin Password</h1>
          <p className="text-sm text-stone-600">
            This simple password gate protects{" "}
            <span className="font-medium">{resourceLabel ?? `the admin portal for ${slug}`}</span>.
          </p>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              placeholder="Enter admin password"
              required
            />
          </label>

          <button
            type="submit"
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            {continueLabel}
          </button>
        </form>
      </section>
    </main>
  );
}

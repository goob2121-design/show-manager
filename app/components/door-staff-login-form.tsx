"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function DoorStaffLoginForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/door-staff-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, username, password }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Unable to sign in.");
        return;
      }
      router.replace(`/admin/${encodeURIComponent(slug)}/door`);
      router.refresh();
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium text-slate-200">
        Username
        <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-emerald-500" required />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-200">
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-emerald-500" required />
      </label>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <button type="submit" disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
        {submitting ? "Signing In..." : "Sign In"}
      </button>
    </form>
  );
}

"use client";
import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"ready" | "working" | "done" | "error">(token ? "ready" : "error");
  async function unsubscribe() {
    setState("working");
    const response = await fetch("/api/public/mailing-list/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    setState(response.ok ? "done" : "error");
  }
  if (state === "done") return <p className="text-lg text-slate-700">You’ve been unsubscribed from Cumberland Mountain Music Show updates.</p>;
  if (state === "error") return <p className="text-lg text-slate-700">This unsubscribe link is invalid or could not be processed.</p>;
  return <div><p className="text-lg text-slate-700">Stop receiving promotional CMMS mailing-list updates?</p><button type="button" disabled={state === "working"} onClick={() => void unsubscribe()} className="mt-6 rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-60">{state === "working" ? "Updating..." : "Unsubscribe"}</button><p className="mt-5 text-sm text-slate-500">This does not affect ticket, reserved-seat, or other transactional emails.</p></div>;
}

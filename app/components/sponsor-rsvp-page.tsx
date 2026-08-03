"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeSponsorCode } from "@/lib/sponsor-rsvp";

type Lookup = {
  sponsor: { publicName: string };
  show: { id: string; name: string; show_date: string | null; show_start_time: string | null; venue: string | null } | null;
  rsvp: { status: string; guest_count: number | null; note: string | null } | null;
};

const primaryButton = "min-h-12 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-500 to-amber-700 px-6 py-3 text-base font-bold text-slate-950 shadow-lg shadow-black/20 transition hover:from-amber-400 hover:to-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "min-h-12 rounded-xl border border-amber-400/45 bg-slate-950/60 px-6 py-3 text-base font-bold text-amber-100 transition hover:border-amber-300 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300";

export function SponsorRsvpPage() {
  const params = useSearchParams();
  const [code, setCode] = useState(() => normalizeSponsorCode(params.get("code")));
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<"attending" | "not_attending" | "">("");
  const [guestCount, setGuestCount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function request(action: "lookup" | "submit") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sponsor-rsvp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, code, status, guestCount, note }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to continue.");
      if (action === "lookup") {
        setLookup(payload);
        setStatus(payload.rsvp?.status === "attending" || payload.rsvp?.status === "not_attending" ? payload.rsvp.status : "");
        setGuestCount(payload.rsvp?.guest_count?.toString() ?? "");
        setNote(payload.rsvp?.note ?? "");
      } else setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void request(lookup ? "submit" : "lookup");
  }

  const showDate = lookup?.show?.show_date
    ? new Date(`${lookup.show.show_date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "Date to be announced";

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#050c1d] px-4 py-7 text-slate-100 sm:px-6 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(180,126,35,0.16),transparent_42%),linear-gradient(180deg,rgba(11,25,50,0.2),rgba(2,7,18,0.75))]" />
      <div className="relative mx-auto w-full max-w-2xl">
        <header className="text-center">
          <Image src="/cmms-logo.png" alt="Cumberland Mountain Music Show" width={460} height={276} className="mx-auto h-auto w-full max-w-[19rem] object-contain sm:max-w-sm" priority />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-amber-400 sm:text-sm">Cumberland Mountain Music Show</p>
          <h1 className="mt-2 font-serif text-4xl font-bold text-white sm:text-5xl">Sponsor RSVP</h1>
          <p className="mt-3 text-sm font-semibold tracking-wide text-amber-100 sm:text-base">Big-Time Show <span aria-hidden="true">•</span> Small-Town Hospitality</p>
        </header>

        <section className="mt-8 rounded-3xl border border-amber-400/35 bg-[#0b1730]/95 p-5 shadow-2xl shadow-black/40 sm:p-8">
          {!lookup ? (
            <form onSubmit={submit} className="mx-auto grid max-w-md gap-5 text-center">
              <div><h2 className="font-serif text-2xl font-bold text-white sm:text-3xl">Enter Your Sponsor ID</h2><p className="mt-3 leading-7 text-slate-300">Your Sponsor ID is printed in your Sponsor Appreciation Packet.</p></div>
              <label className="grid gap-2"><span className="sr-only">Sponsor ID, exactly four characters</span><input value={code} onChange={(event) => setCode(normalizeSponsorCode(event.target.value).slice(0, 4))} minLength={4} maxLength={4} autoCapitalize="characters" autoComplete="off" placeholder="AB12" aria-label="Sponsor ID" className="min-h-16 rounded-2xl border border-amber-400/50 bg-[#030918] px-4 py-4 text-center text-3xl font-black uppercase tracking-[0.28em] text-white outline-none placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30 sm:text-4xl" /></label>
              <button disabled={busy || code.length !== 4} className={primaryButton}>{busy ? "Checking…" : "Continue"}</button>
            </form>
          ) : !confirmed ? (
            <section className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Welcome</p><h2 className="mt-2 font-serif text-3xl font-bold text-white">Welcome, {lookup.sponsor.publicName}</h2><p className="mt-4 text-lg text-slate-200">Is this your organization?</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setConfirmed(true)} className={primaryButton}>Yes, Continue</button><button type="button" onClick={() => { setLookup(null); setConfirmed(false); setError(""); }} className={secondaryButton}>No, Go Back</button></div></section>
          ) : !lookup.show ? (
            <p className="rounded-2xl border border-amber-400/25 bg-slate-950/55 p-5 text-center leading-7 text-slate-200">There is not an upcoming show available for RSVP right now. Please check back soon.</p>
          ) : complete ? (
            <section className="text-center"><h2 className="font-serif text-3xl font-bold text-white">{status === "attending" ? "Thank you! We’re looking forward to seeing you." : "Thank you for letting us know."}</h2><p className="mt-4 leading-7 text-slate-200">{status === "attending" ? `We’ve recorded that ${guestCount} guest(s) will be attending.` : "We completely understand, and we’re very grateful for your support. We’ll make those reserved seats available to other guests."}</p><button type="button" onClick={() => setComplete(false)} className={`${secondaryButton} mt-7`}>Update My RSVP</button></section>
          ) : (
            <form onSubmit={submit} className="grid gap-5">
              <section className="rounded-2xl border border-amber-400/25 bg-slate-950/45 p-5 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">Upcoming Show</p><h2 className="mt-2 font-serif text-2xl font-bold text-white">{lookup.show.name}</h2><p className="mt-2 text-slate-200">{showDate}{lookup.show.show_start_time ? ` • ${lookup.show.show_start_time}` : ""}</p>{lookup.show.venue ? <p className="mt-1 text-slate-300">{lookup.show.venue}</p> : null}</section>
              <section><h2 className="text-center font-serif text-3xl font-bold text-white">Will You Be Joining Us?</h2><div className="mt-5 space-y-4 leading-7 text-slate-300"><p>Thank you for supporting the Cumberland Mountain Music Show. Your sponsorship means a great deal to us and helps make this event possible.</p><p>If you won’t be able to attend, that is absolutely no problem. We completely understand and truly appreciate your support whether you are able to join us or not.</p><p>We simply ask that you let us know so we can make those reserved seats available to other guests who would enjoy the show.</p><p>If you will be attending, we’ll make sure your reserved seats are waiting for you.</p></div></section>
              <fieldset className="grid gap-3"><legend className="sr-only">Will you attend?</legend><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 font-semibold transition ${status === "attending" ? "border-amber-300 bg-amber-400/15 text-amber-50" : "border-slate-600 bg-slate-950/35 text-slate-200 hover:border-amber-400/60"}`}><input type="radio" name="attendance" checked={status === "attending"} onChange={() => setStatus("attending")} className="h-5 w-5 accent-amber-500" /> Yes, we’ll be attending</label><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 font-semibold transition ${status === "not_attending" ? "border-amber-300 bg-amber-400/15 text-amber-50" : "border-slate-600 bg-slate-950/35 text-slate-200 hover:border-amber-400/60"}`}><input type="radio" name="attendance" checked={status === "not_attending"} onChange={() => setStatus("not_attending")} className="h-5 w-5 accent-amber-500" /> No, we won’t be able to attend</label></fieldset>
              {status === "attending" ? <label className="grid gap-2 font-semibold text-amber-100">How many guests will attend?<input type="number" min={1} required value={guestCount} onChange={(event) => setGuestCount(event.target.value)} className="min-h-12 rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-lg text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30" /></label> : null}
              <label className="grid gap-2 font-semibold text-amber-100">Anything else you’d like us to know?<span className="text-sm font-normal text-slate-400">Optional</span><textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} className="min-h-28 resize-y rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30" /></label>
              <button disabled={busy || !status} className={primaryButton}>{busy ? "Saving…" : "Submit RSVP"}</button>
            </form>
          )}
          {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-950/70 p-4 text-center text-rose-100">{error}</p> : null}
        </section>
        <p className="mt-6 text-center text-xs text-slate-500">Cumberland Mountain Music Show</p>
      </div>
    </main>
  );
}
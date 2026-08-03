import { Suspense } from "react";
import { SponsorRsvpPage } from "@/app/components/sponsor-rsvp-page";

export default function Page() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-950 p-6 text-white">Loading Sponsor RSVP…</main>}><SponsorRsvpPage /></Suspense>;
}

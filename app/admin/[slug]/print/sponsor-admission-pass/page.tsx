import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGate } from "@/app/components/admin-gate";
import { PrintButton } from "@/app/components/print-button";
import { ReservationTicketCode } from "@/app/components/reservation-ticket-code";
import { buildSponsorAdmissionPasses, sponsorAdmissionSeatSummary } from "@/lib/sponsor-admission-pass";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShowCompTicket, ShowRecord, ShowReservedSeatAssignment, ShowReservedSeatingLink, ShowSponsor, SponsorLibraryEntry } from "@/lib/types";

type SponsorRow = ShowSponsor & { sponsor?: SponsorLibraryEntry | SponsorLibraryEntry[] | null };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ id?: string; ids?: string; scope?: string }> };

function formatDate(value: string | null) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function SponsorAdmissionPassPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const supabase = await createServerSupabaseClient();
  const { data: showData } = await supabase.from("shows").select("*").eq("slug", slug).maybeSingle();
  const show = showData as ShowRecord | null;
  if (!show) notFound();
  const [{ data: sponsorData }, { data: compData }, { data: linkData }, { data: assignmentData }] = await Promise.all([
    supabase.from("show_sponsors").select("*, sponsor:sponsor_id (*)").eq("show_id", show.id),
    supabase.from("show_comp_tickets").select("*").eq("show_id", show.id),
    supabase.from("show_reserved_seating_links").select("*").eq("show_id", show.id),
    supabase.from("show_reserved_seat_assignments").select("*").eq("show_id", show.id),
  ]);
  const result = buildSponsorAdmissionPasses({ sponsors: (sponsorData ?? []) as SponsorRow[], compTickets: (compData ?? []) as ShowCompTicket[], links: (linkData ?? []) as ShowReservedSeatingLink[], assignments: (assignmentData ?? []) as ShowReservedSeatAssignment[] });
  const requestedIds = new Set([query.id, ...(query.ids?.split(",") ?? [])].map((value) => value?.trim()).filter((value): value is string => Boolean(value)));
  const passes = result.passes.filter((pass) => query.scope === "all" ? pass.rowId.startsWith("sponsor-") : requestedIds.has(pass.rowId));
  const missing = [...requestedIds].filter((id) => !passes.some((pass) => pass.rowId === id));

  return <AdminGate slug={slug} resourceLabel={`sponsor admission passes for ${show.name}`} continueLabel="Continue to Admission Pass">
    <main className="min-h-screen bg-stone-100 p-4 text-stone-950 print:bg-white print:p-0">
      <style>{`
        @page { size: letter portrait; margin: 0; }
        .admission-pass { width: 8.5in; min-height: 11in; break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid; }
        .admission-pass:last-child { break-after: auto; page-break-after: auto; }
        .admission-pass .ticket-code-block { border: 0 !important; background: transparent !important; padding: 0 !important; }
        .admission-pass .ticket-code-surface { border: 0 !important; padding: 6px !important; }
        .admission-pass .ticket-code-meta, .admission-pass .ticket-code-intro { display: none !important; }
        .admission-pass img[alt="Reservation barcode"] { max-width: 5.8in !important; max-height: 1.35in !important; }
        .admission-pass img[alt="Reservation QR code"] { max-width: 2.15in !important; max-height: 2.15in !important; }
        @media print { html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; } .admission-pass { margin: 0 !important; box-shadow: none !important; } }
      `}</style>
      <div className="mx-auto mb-4 flex max-w-[8.5in] items-center justify-between gap-3 print:hidden"><Link href={`/admin/${slug}`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold">Back to Admin</Link><PrintButton /></div>
      {passes.length ? <div className="mx-auto max-w-[8.5in]">{passes.map((pass) => {
        const seating = sponsorAdmissionSeatSummary(pass);
        return <article key={pass.id} className="admission-pass flex flex-col bg-white px-[0.65in] py-[0.55in] shadow-xl print:shadow-none">
          <header className="border-b-2 border-stone-900 pb-5 text-center"><img src="/cmms-logo.png" alt="Cumberland Mountain Music Show logo" className="mx-auto h-auto max-h-[88px] max-w-[320px] object-contain" /><p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-amber-700">Cumberland Mountain Music Show</p><h1 className="mt-2 text-3xl font-black tracking-[0.08em]">OFFICIAL ADMISSION PASS</h1></header>
          <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-stone-300 bg-stone-50 p-4 text-sm"><div><strong className="block text-[10px] uppercase tracking-widest text-stone-500">Show</strong>{show.name}</div><div><strong className="block text-[10px] uppercase tracking-widest text-stone-500">Date</strong>{formatDate(show.show_date)}</div><div><strong className="block text-[10px] uppercase tracking-widest text-stone-500">Venue</strong>{show.venue || "Venue TBD"}</div><div><strong className="block text-[10px] uppercase tracking-widest text-stone-500">Doors / Show</strong>{show.guest_arrival_time || "6:00 PM"} / {show.show_start_time || "TBD"}</div></section>
          <section className="mt-5 text-center"><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">{pass.admissionLabel}</p><h2 className="mt-2 text-3xl font-black">{pass.sponsorName}</h2>{pass.contactName && pass.contactName !== pass.sponsorName ? <p className="mt-1 text-base text-stone-600">Issued to {pass.contactName}</p> : null}<p className="mt-2 text-sm font-bold">{pass.quantity} admission{pass.quantity === 1 ? "" : "s"}</p></section>
          <section className="mt-5 rounded-2xl border-2 border-stone-900 px-6 py-5 text-center"><p className="text-xs font-black uppercase tracking-[0.25em] text-stone-600">{seating.heading}</p>{seating.lines.map((line, index) => <p key={line} className={index === seating.lines.length - 1 ? "mt-1 text-3xl font-black" : "mt-2 text-xl font-black"}>{line}</p>)}</section>
          <section className="mt-5 text-center"><p className="text-base font-black uppercase tracking-[0.16em]">Present this page at the door</p><div className="mt-2"><ReservationTicketCode scanToken={pass.scanToken} format={show.ticket_code_format} purchaserName={pass.contactName || pass.sponsorName} ticketCount={pass.quantity} seatLabels={pass.seats.map((seat) => seat.seat_id)} printable /></div><p className="mt-2 font-mono text-sm font-bold tracking-[0.08em]">Entry Code: {pass.scanToken}</p>{pass.quantity > 1 ? <p className="mt-2 text-sm font-semibold">One scan admits all {pass.quantity} admissions listed on this pass.</p> : null}</section>
          <footer className="mt-auto border-t border-stone-300 pt-4 text-center text-xs leading-5 text-stone-600"><p className="font-bold text-stone-900">Thank you for supporting the Cumberland Mountain Music Show.</p><p>cumberlandmountainmusic.com · info@cumberlandmountainmusic.com</p></footer>
        </article>;
      })}</div> : <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-white p-6 text-center"><h1 className="text-xl font-black">Admission Pass Not Ready</h1><p className="mt-2 text-sm text-stone-600">A canonical complimentary admission with an existing entry code is required before a pass can be printed.</p>{missing.length ? <p className="mt-3 text-xs text-stone-500">Requested record: {missing.join(", ")}</p> : null}</section>}
    </main>
  </AdminGate>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoPrintOnMount } from "@/app/components/auto-print-on-mount";
import { AdminGate } from "@/app/components/admin-gate";
import { PrintButton } from "@/app/components/print-button";
import { getDoorSaleReceiptSnapshot } from "@/lib/door-sale-receipt";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShowCompTicket, ShowRecord } from "@/lib/types";

type Props = {
  params: Promise<{ slug: string; ticketId: string }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatShowDate(value: string | null) {
  if (!value) return "Show date TBD";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatSaleDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export default async function DoorReceiptPrintPage({ params }: Props) {
  const { slug, ticketId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: showData } = await supabase.from("shows").select("*").eq("slug", slug).maybeSingle();
  const show = showData as ShowRecord | null;
  if (!show) notFound();

  const { data: ticketData } = await supabase
    .from("show_comp_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("show_id", show.id)
    .eq("ticket_type", "door_paid")
    .maybeSingle();
  const ticket = ticketData as ShowCompTicket | null;
  if (!ticket) notFound();

  const receiptSnapshot = getDoorSaleReceiptSnapshot(ticket);

  return (
    <AdminGate slug={slug} resourceLabel={`door-sale receipt for ${show.name}`} continueLabel="Continue to Receipt">
      <main className="min-h-screen bg-stone-200 p-4 text-stone-950 print:bg-white print:p-0">
        <AutoPrintOnMount />
        <style>{`
          @page { size: 8.5in 3.5in; margin: 0; }
          .door-sale-receipt-sheet { position: relative; width: 8.5in; height: 3.5in; overflow: hidden; }
          .door-sale-receipt { position: absolute; top: -0.2in; left: 8.5in; box-sizing: border-box; width: 3.5in; height: 8.5in; overflow: hidden; transform: rotate(90deg); transform-origin: top left; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .door-sale-receipt-sheet, .door-sale-receipt { margin: 0 !important; box-shadow: none !important; }
          }
        `}</style>
        <div className="mx-auto mb-4 flex max-w-[8.5in] items-center justify-between gap-3 print:hidden">
          <Link href={`/admin/${slug}/door`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold">
            Back to Door Mode
          </Link>
          <PrintButton />
        </div>

        <div className="door-sale-receipt-sheet mx-auto bg-white shadow-xl print:shadow-none">
          <article className="door-sale-receipt flex flex-col bg-white px-[0.28in] py-[0.34in] text-stone-950">
            <header className="border-b-2 border-stone-950 pb-3 text-center">
              <img src="/cmms-logo.png" alt="Cumberland Mountain Music Show logo" className="mx-auto h-auto max-h-[58px] max-w-[200px] object-contain grayscale contrast-200" />
              <h1 className="mt-2 text-[15px] font-black uppercase tracking-[0.08em]">Cumberland Mountain Music Show</h1>
              <p className="mt-1 text-sm font-bold">{formatShowDate(show.show_date)}</p>
              <p className="text-sm font-semibold">{show.venue || "Cumberland Gap, Tennessee"}</p>
            </header>

            {receiptSnapshot ? (
              <section className="mt-4">
                <p className="text-center text-sm font-black uppercase tracking-[0.18em]">Door Admission</p>
                <div className="mt-3 border-y border-dashed border-stone-600 py-3 text-base font-semibold">
                  <div className="flex justify-between gap-3"><span>{ticket.ticket_count} Ticket{ticket.ticket_count === 1 ? "" : "s"} @ {formatCurrency(receiptSnapshot.unitPrice)}</span><span>{formatCurrency(receiptSnapshot.total)}</span></div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-4 border-b-2 border-stone-950 pb-3">
                  <span className="text-lg font-black uppercase tracking-[0.14em]">Total</span>
                  <span className="text-3xl font-black">{formatCurrency(receiptSnapshot.total)}</span>
                </div>
                <div className="mt-3 flex justify-between border-b border-stone-600 pb-3 text-base font-black uppercase tracking-[0.12em]">
                  <span>Payment</span>
                  <span>Cash</span>
                </div>
              </section>
            ) : (
              <section className="mt-5 border-y border-dashed border-stone-700 py-4 text-center">
                <p className="font-black uppercase tracking-[0.12em]">Historical Sale</p>
                <p className="mt-1 text-sm font-semibold">Receipt payment details were not recorded for this sale.</p>
              </section>
            )}

            <footer className="mt-auto border-t-2 border-stone-950 pt-3 text-center text-sm leading-5">
              <p>Receipt: <span className="font-mono font-bold">{ticket.order_id || "Unavailable"}</span></p>
              <p className="font-semibold">{formatSaleDateTime(ticket.created_at)}</p>
              <p className="mt-3 font-black">Thank you for supporting the<br />Cumberland Mountain Music Show!</p>
              <p className="mt-1 font-bold">cumberlandmountainmusic.com</p>
            </footer>
          </article>
        </div>
      </main>
    </AdminGate>
  );
}

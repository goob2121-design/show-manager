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
  searchParams: Promise<{ autoClose?: string }>;
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

export default async function DoorReceiptPrintPage({ params, searchParams }: Props) {
  const [{ slug, ticketId }, query] = await Promise.all([params, searchParams]);
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
      <main className="min-h-screen bg-stone-200 p-4 text-stone-950 print:min-h-0 print:bg-white print:p-0">
        <AutoPrintOnMount closeAfterPrint={query.autoClose === "1"} />
        <style>{`
          @page { size: 58mm 210mm; margin: 0; }
          .door-sale-receipt-sheet { box-sizing: border-box; width: 58mm; break-inside: avoid; page-break-inside: avoid; }
          .door-sale-receipt { box-sizing: border-box; width: 58mm; padding: 3mm 5mm 2mm 5mm; break-inside: avoid; page-break-inside: avoid; overflow-wrap: anywhere; }
          .door-sale-receipt > *, .door-sale-receipt section > div, .door-sale-receipt section > div > div { box-sizing: border-box; width: 100%; min-width: 0; }
          @media print {
            html, body { width: 58mm; margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .door-sale-receipt-sheet, .door-sale-receipt, .door-sale-receipt footer { margin: 0 !important; box-shadow: none !important; break-inside: avoid; page-break-inside: avoid; }
            .door-sale-receipt, .door-sale-receipt * { color: #000 !important; opacity: 1 !important; border-color: #000 !important; }
            .door-sale-receipt img { filter: grayscale(1) contrast(2); }
          }
        `}</style>
        <div className="mx-auto mb-4 flex max-w-[58mm] items-center justify-between gap-3 print:hidden">
          <Link href={`/admin/${slug}/door`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold">
            Back to Door Mode
          </Link>
          <PrintButton />
        </div>

        <div className="door-sale-receipt-sheet mx-auto bg-white shadow-xl print:shadow-none">
          <article className="door-sale-receipt bg-white text-stone-950">
            <header className="border-b-2 border-stone-950 pb-2 text-center">
              <img src="/cmms-logo.png" alt="Cumberland Mountain Music Show logo" className="mx-auto h-auto max-h-10 max-w-[128px] object-contain" />
              <h1 className="mt-2 text-[13px] font-black uppercase leading-4 tracking-[0.06em]">Cumberland Mountain Music Show</h1>
              <p className="mt-1 text-[11px] font-bold">{formatShowDate(show.show_date)}</p>
              <p className="text-[11px] font-bold leading-4">{show.venue || "Cumberland Gap, Tennessee"}</p>
            </header>

            {receiptSnapshot ? (
              <section className="mt-3">
                <p className="text-center text-[12px] font-black uppercase tracking-[0.14em]">Door Admission</p>
                <div className="mt-3 border-y border-dashed border-stone-950 py-2 text-[11px] font-bold">
                  <div className="flex justify-between gap-2"><span>{ticket.ticket_count} Ticket{ticket.ticket_count === 1 ? "" : "s"} @ {formatCurrency(receiptSnapshot.unitPrice)}</span><span>{formatCurrency(receiptSnapshot.total)}</span></div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 border-b-2 border-stone-950 pb-2">
                  <span className="text-[14px] font-black uppercase tracking-[0.1em]">Total</span>
                  <span className="text-[22px] font-black leading-none">{formatCurrency(receiptSnapshot.total)}</span>
                </div>
                <div className="mt-2 flex justify-between border-b border-stone-950 pb-2 text-[11px] font-black uppercase tracking-[0.1em]">
                  <span>Payment</span>
                  <span>{receiptSnapshot.paymentMethod === "cash" ? "Cash" : "Card"}</span>
                </div>
              </section>
            ) : (
              <section className="mt-4 border-y border-dashed border-stone-950 py-3 text-center">
                <p className="text-[12px] font-black uppercase tracking-[0.1em]">Historical Sale</p>
                <p className="mt-1 text-[11px] font-bold leading-4">Receipt payment details were not recorded for this sale.</p>
              </section>
            )}

            <footer className="mt-3 border-t-2 border-stone-950 pt-2 text-center text-[11px] font-bold leading-4">
              <p>Receipt: <span className="font-mono font-bold">{ticket.order_id || "Unavailable"}</span></p>
              <p>{formatSaleDateTime(ticket.created_at)}</p>
              <p className="mt-2 font-black">Thank you for supporting<br />The Cumberland Mountain Music Show!</p>
              <p className="mt-1 font-black">cumberlandmountainmusic.com</p>
            </footer>
          </article>
        </div>
      </main>
    </AdminGate>
  );
}

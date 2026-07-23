import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReservedSeatEmail, type ReservedSeatEmailResult } from "@/lib/email/reserved-seat-email";
import { RESERVED_SEATING_VENUE } from "@/lib/reserved-seating";

type EmailLinkRow = {
  id: string; show_id: string; customer_name: string; email: string | null; ticket_count: number;
  selection_token: string; sent_at: string | null; resend_email_id: string | null;
  email_attempt_count: number | null; seat_category: string | null;
};

type EmailShowRow = { name: string; show_date: string | null; show_start_time: string | null; venue: string | null; venue_address: string | null };

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

function formatShowDate(value: string | null) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function safeError(value: string | null) {
  return value?.replace(/https?:\/\/\S+/gi, "[private link removed]").slice(0, 500) || "Email delivery failed.";
}

export async function sendTrackedReservedSeatEmail(
  supabase: SupabaseClient,
  linkId: string,
  options: { allowResend?: boolean } = {},
): Promise<ReservedSeatEmailResult & { sentAt: string | null; alreadySent?: boolean }> {
  const { data: linkData, error: linkError } = await supabase.from("show_reserved_seating_links").select("id,show_id,customer_name,email,ticket_count,selection_token,sent_at,resend_email_id,email_attempt_count,seat_category").eq("id", linkId).maybeSingle();
  if (linkError) throw linkError;
  const link = linkData as EmailLinkRow | null;
  if (!link) return { success: false, resendId: null, error: "Reserved seating link was not found.", sentAt: null };
  if (link.resend_email_id && !options.allowResend) return { success: true, resendId: link.resend_email_id, error: null, sentAt: link.sent_at, alreadySent: true };

  const { data: showData, error: showError } = await supabase.from("shows").select("name,show_date,show_start_time,venue,venue_address").eq("id", link.show_id).maybeSingle();
  if (showError) throw showError;
  const show = showData as EmailShowRow | null;
  if (!show) return { success: false, resendId: null, error: "Show was not found.", sentAt: null };

  const attemptAt = new Date().toISOString();
  const attemptCount = Math.max(0, link.email_attempt_count ?? 0) + 1;
  const { error: attemptError } = await supabase.from("show_reserved_seating_links").update({ email_attempt_count: attemptCount, last_email_attempt_at: attemptAt }).eq("id", link.id);
  if (attemptError) throw attemptError;

  const baseUrl = siteUrl();
  const result = await sendReservedSeatEmail({
    customerName: link.customer_name,
    customerEmail: link.email ?? "",
    showName: show.name,
    showDate: formatShowDate(show.show_date),
    showTime: show.show_start_time,
    venueName: show.venue?.trim() || RESERVED_SEATING_VENUE.venueName,
    venueAddress: show.venue_address?.trim() || RESERVED_SEATING_VENUE.venueAddress,
    ticketCount: link.ticket_count,
    seatSelectionUrl: `${baseUrl}/reserved-seating/${link.selection_token}`,
    logoUrl: `${baseUrl}/cmms-logo.png`,
    categoryLabel: link.seat_category,
  });

  if (!result.success) {
    const error = safeError(result.error);
    await supabase.from("show_reserved_seating_links").update({ last_email_error: error }).eq("id", link.id);
    return { ...result, error, sentAt: link.sent_at };
  }

  const sentAt = new Date().toISOString();
  const { error: trackingError } = await supabase.from("show_reserved_seating_links").update({ sent_at: sentAt, resend_email_id: result.resendId, last_email_error: null }).eq("id", link.id);
  if (trackingError) throw trackingError;
  return { ...result, sentAt };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReservedSeatEmail, type ReservedSeatEmailResult } from "@/lib/email/reserved-seat-email";
import { RESERVED_SEATING_VENUE } from "@/lib/reserved-seating";
import { buildReservedSeatSelectionUrl, getStageFlowEmailLogoUrl } from "@/lib/server/stageflow-public-url";

type EmailLinkRow = {
  id: string; show_id: string; customer_name: string; email: string | null; ticket_count: number;
  selection_token: string; sent_at: string | null; resend_email_id: string | null;
  email_attempt_count: number | null; seat_category: string | null;
};

type EmailShowRow = { name: string; show_date: string | null; show_start_time: string | null; venue: string | null; venue_address: string | null };

function formatShowDate(value: string | null) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function safeError(value: string | null) {
  return value?.replace(/https?:\/\/\S+/gi, "[private link removed]").slice(0, 500) || "Email delivery failed.";
}

const EMAIL_SEND_CLAIM_PREFIX = "sending:";

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
  const sendClaim = options.allowResend ? null : `${EMAIL_SEND_CLAIM_PREFIX}${crypto.randomUUID()}`;
  if (sendClaim) {
    const { data: claimedRows, error: claimError } = await supabase
      .from("show_reserved_seating_links")
      .update({ resend_email_id: sendClaim, email_attempt_count: attemptCount, last_email_attempt_at: attemptAt })
      .eq("id", link.id)
      .is("resend_email_id", null)
      .select("id");
    if (claimError) throw claimError;
    if (!claimedRows?.length) {
      return { success: true, resendId: null, error: null, sentAt: link.sent_at, alreadySent: true };
    }
  } else {
    const { error: attemptError } = await supabase.from("show_reserved_seating_links").update({ email_attempt_count: attemptCount, last_email_attempt_at: attemptAt }).eq("id", link.id);
    if (attemptError) throw attemptError;
  }


  let seatSelectionUrl: string;
  let logoUrl: string;
  try {
    seatSelectionUrl = buildReservedSeatSelectionUrl(link.selection_token);
    logoUrl = getStageFlowEmailLogoUrl();
  } catch (error) {
    const message = safeError(error instanceof Error ? error.message : "StageFlow public URL is not configured.");
    let update = supabase.from("show_reserved_seating_links").update({ last_email_error: message, ...(sendClaim ? { resend_email_id: null } : {}) }).eq("id", link.id);
    if (sendClaim) update = update.eq("resend_email_id", sendClaim);
    await update;
    return { success: false, resendId: null, error: message, sentAt: link.sent_at };
  }
  const result = await sendReservedSeatEmail({
    customerName: link.customer_name,
    customerEmail: link.email ?? "",
    showName: show.name,
    showDate: formatShowDate(show.show_date),
    showTime: show.show_start_time,
    venueName: show.venue?.trim() || RESERVED_SEATING_VENUE.venueName,
    venueAddress: show.venue_address?.trim() || RESERVED_SEATING_VENUE.venueAddress,
    ticketCount: link.ticket_count,
    seatSelectionUrl,
    logoUrl,
    categoryLabel: link.seat_category,
  });

  if (!result.success) {
    const error = safeError(result.error);
    let update = supabase.from("show_reserved_seating_links").update({ last_email_error: error, ...(sendClaim ? { resend_email_id: null } : {}) }).eq("id", link.id);
    if (sendClaim) update = update.eq("resend_email_id", sendClaim);
    await update;
    return { ...result, error, sentAt: link.sent_at };
  }

  const sentAt = new Date().toISOString();
  const trackedResendId = result.resendId ?? (sendClaim ? `sent:${sendClaim.slice(EMAIL_SEND_CLAIM_PREFIX.length)}` : `sent:${crypto.randomUUID()}`);
  let trackingUpdate = supabase.from("show_reserved_seating_links").update({ sent_at: sentAt, resend_email_id: trackedResendId, last_email_error: null }).eq("id", link.id);
  if (sendClaim) trackingUpdate = trackingUpdate.eq("resend_email_id", sendClaim);
  const { error: trackingError } = await trackingUpdate;
  if (trackingError) throw trackingError;
  return { ...result, sentAt };
}

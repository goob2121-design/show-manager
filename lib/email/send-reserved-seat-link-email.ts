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
const LEGACY_SENT_MARKER_PREFIX = "sent:";

export type TrackedEmailDeliveryState = "sent_now" | "already_sent_current_link" | "in_progress" | "failed";

export function classifyTrackedEmailState(resendEmailId: string | null, sentAt: string | null): TrackedEmailDeliveryState {
  if (resendEmailId?.startsWith(EMAIL_SEND_CLAIM_PREFIX)) return "in_progress";
  if (resendEmailId && sentAt && !resendEmailId.startsWith(LEGACY_SENT_MARKER_PREFIX)) return "already_sent_current_link";
  return "failed";
}

export function trackedEmailStateWasSent(state: TrackedEmailDeliveryState) {
  return state === "sent_now" || state === "already_sent_current_link";
}

function deliveryFlags(state: TrackedEmailDeliveryState) {
  return {
    deliveryState: state,
    sentNow: state === "sent_now",
    alreadySent: state === "already_sent_current_link",
    inProgress: state === "in_progress",
    failed: state === "failed",
  };
}

export async function sendTrackedReservedSeatEmail(
  supabase: SupabaseClient,
  linkId: string,
  options: { allowResend?: boolean } = {},
): Promise<ReservedSeatEmailResult & ReturnType<typeof deliveryFlags> & { sentAt: string | null }> {
  const { data: linkData, error: linkError } = await supabase.from("show_reserved_seating_links").select("id,show_id,customer_name,email,ticket_count,selection_token,sent_at,resend_email_id,email_attempt_count,seat_category").eq("id", linkId).maybeSingle();
  if (linkError) throw linkError;
  const link = linkData as EmailLinkRow | null;
  if (!link) return { success: false, resendId: null, error: "Reserved seating link was not found.", sentAt: null, ...deliveryFlags("failed") };
  if (!options.allowResend && link.resend_email_id) {
    const state = classifyTrackedEmailState(link.resend_email_id, link.sent_at);
    return {
      success: state === "already_sent_current_link",
      resendId: state === "already_sent_current_link" ? link.resend_email_id : null,
      error: state === "failed" ? "Email tracking state is incomplete." : null,
      sentAt: link.sent_at,
      ...deliveryFlags(state),
    };
  }

  const { data: showData, error: showError } = await supabase.from("shows").select("name,show_date,show_start_time,venue,venue_address").eq("id", link.show_id).maybeSingle();
  if (showError) throw showError;
  const show = showData as EmailShowRow | null;
  if (!show) return { success: false, resendId: null, error: "Show was not found.", sentAt: null, ...deliveryFlags("failed") };

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
      const { data: currentData, error: currentError } = await supabase
        .from("show_reserved_seating_links")
        .select("sent_at,resend_email_id")
        .eq("id", link.id)
        .maybeSingle();
      if (currentError) throw currentError;
      const current = currentData as Pick<EmailLinkRow, "sent_at" | "resend_email_id"> | null;
      const state = classifyTrackedEmailState(current?.resend_email_id ?? null, current?.sent_at ?? null);
      return {
        success: state === "already_sent_current_link",
        resendId: state === "already_sent_current_link" ? current?.resend_email_id ?? null : null,
        error: state === "failed" ? "Email send claim could not be acquired." : null,
        sentAt: current?.sent_at ?? null,
        ...deliveryFlags(state),
      };
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
    return { success: false, resendId: null, error: message, sentAt: link.sent_at, ...deliveryFlags("failed") };
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
    return { ...result, error, sentAt: link.sent_at, ...deliveryFlags("failed") };
  }

  const sentAt = new Date().toISOString();
  const trackedResendId = result.resendId ?? (sendClaim ? `sent:${sendClaim.slice(EMAIL_SEND_CLAIM_PREFIX.length)}` : `sent:${crypto.randomUUID()}`);
  let trackingUpdate = supabase.from("show_reserved_seating_links").update({ sent_at: sentAt, resend_email_id: trackedResendId, last_email_error: null }).eq("id", link.id);
  if (sendClaim) trackingUpdate = trackingUpdate.eq("resend_email_id", sendClaim);
  const { error: trackingError } = await trackingUpdate;
  if (trackingError) throw trackingError;
  return { ...result, sentAt, ...deliveryFlags("sent_now") };
}

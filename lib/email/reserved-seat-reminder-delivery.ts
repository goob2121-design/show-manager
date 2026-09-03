import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReservedSeatReminderEmail, RESERVED_SEAT_REMINDER_SUBJECT } from "@/lib/email/reserved-seat-reminder-email";
import { getReservedSeatReminderEligibility, type ReservedSeatReminderEligibilityReason } from "@/lib/reserved-seat-reminder-eligibility";
import { buildReservedSeatSelectionUrl } from "@/lib/server/stageflow-public-url";
import { resolveReservedSeatRecipientEmail } from "@/lib/email/resolve-reserved-seat-recipient";

export type ReservedSeatReminderRequestedSource = "admin_single" | "admin_bulk";
export type ReservedSeatReminderDeliveryResult = {
  reservationId: string;
  outcome: "sent" | "already_processed" | "not_eligible" | "failed";
  reason: ReservedSeatReminderEligibilityReason | null;
  deliveryId: string | null;
  sequenceNumber: number | null;
  resendEmailId: string | null;
  error: string | null;
};

type ReminderLinkRow = {
  id: string;
  show_id: string;
  customer_name: string;
  email: string | null;
  ticket_count: number;
  selection_token: string;
  submitted_at: string | null;
  source_ticket_id: string | null;
  source_show_sponsor_id: string | null;
  is_complimentary: boolean;
  seat_category: string | null;
};

type ReminderShowRow = { id: string; name: string; show_date: string | null };
type DeliveryRow = {
  id: string;
  sequence_number: number;
  resend_email_id: string | null;
  send_status: "pending" | "accepted" | "failed";
  error_message: string | null;
  provider_idempotency_key: string;
};

function safeError(value: string | null | undefined) {
  return (value || "Email delivery failed.").replace(/https?:\/\/\S+/gi, "[private link removed]").slice(0, 500);
}

function existingResult(reservationId: string, delivery: DeliveryRow): ReservedSeatReminderDeliveryResult {
  return {
    reservationId,
    outcome: delivery.send_status === "accepted" ? "already_processed" : delivery.send_status === "failed" ? "failed" : "already_processed",
    reason: null,
    deliveryId: delivery.id,
    sequenceNumber: delivery.sequence_number,
    resendEmailId: delivery.resend_email_id,
    error: delivery.error_message,
  };
}

export async function deliverReservedSeatReminder(input: {
  supabase: SupabaseClient;
  showId: string;
  reservationId: string;
  requestId: string;
  requestedSource: ReservedSeatReminderRequestedSource;
  bulkOperationId?: string | null;
  sendEmail?: typeof sendReservedSeatReminderEmail;
}): Promise<ReservedSeatReminderDeliveryResult> {
  const sendEmail = input.sendEmail ?? sendReservedSeatReminderEmail;
  const existingRequest = await input.supabase.from("reserved_seat_email_deliveries").select("id,sequence_number,resend_email_id,send_status,error_message,provider_idempotency_key").eq("request_id", input.requestId).maybeSingle();
  if (existingRequest.error) throw existingRequest.error;
  if (existingRequest.data) return existingResult(input.reservationId, existingRequest.data as DeliveryRow);

  const [{ data: showData, error: showError }, { data: linkData, error: linkError }] = await Promise.all([
    input.supabase.from("shows").select("id,name,show_date").eq("id", input.showId).maybeSingle(),
    input.supabase.from("show_reserved_seating_links").select("id,show_id,customer_name,email,ticket_count,selection_token,submitted_at,source_ticket_id,source_show_sponsor_id,is_complimentary,seat_category").eq("id", input.reservationId).eq("show_id", input.showId).maybeSingle(),
  ]);
  if (showError) throw showError;
  if (linkError) throw linkError;
  const show = showData as ReminderShowRow | null;
  const link = linkData as ReminderLinkRow | null;
  if (!show || !link) return { reservationId: input.reservationId, outcome: "not_eligible", reason: "general_admission", deliveryId: null, sequenceNumber: null, resendEmailId: null, error: null };
  link.email = await resolveReservedSeatRecipientEmail(input.supabase, {
    showId: link.show_id, customerName: link.customer_name, email: link.email,
    reservedSeatLinkId: link.id,
    sourceTicketId: link.source_ticket_id, sourceShowSponsorId: link.source_show_sponsor_id,
    isComplimentary: link.is_complimentary, seatCategory: link.seat_category,
  });

  const { count, error: assignmentError } = await input.supabase.from("show_reserved_seat_assignments").select("id", { count: "exact", head: true }).eq("seating_link_id", link.id).eq("assignment_type", "customer");
  if (assignmentError) throw assignmentError;
  const eligibility = getReservedSeatReminderEligibility({ ticketCount: link.ticket_count, assignedCustomerSeatCount: count ?? 0, email: link.email, selectionToken: link.selection_token, submittedAt: link.submitted_at, isReservedSeating: true });
  if (!eligibility.eligible) return { reservationId: link.id, outcome: "not_eligible", reason: eligibility.reason, deliveryId: null, sequenceNumber: null, resendEmailId: null, error: null };

  const providerIdempotencyKey = `stageflow-reminder-${input.requestId}`;
  let delivery: DeliveryRow | null = null;
  for (let attempt = 0; attempt < 3 && !delivery; attempt += 1) {
    const { data: latest } = await input.supabase.from("reserved_seat_email_deliveries").select("sequence_number").eq("reserved_seating_link_id", link.id).eq("email_type", "reserved_seat_reminder").order("sequence_number", { ascending: false }).limit(1).maybeSingle();
    const sequenceNumber = Math.max(0, Number(latest?.sequence_number ?? 0)) + 1;
    const inserted = await input.supabase.from("reserved_seat_email_deliveries").insert({ show_id: show.id, reserved_seating_link_id: link.id, email_type: "reserved_seat_reminder", sequence_number: sequenceNumber, recipient: link.email!.trim(), subject: RESERVED_SEAT_REMINDER_SUBJECT, resend_email_id: null, provider_idempotency_key: providerIdempotencyKey, request_id: input.requestId, requested_source: input.requestedSource, bulk_operation_id: input.bulkOperationId ?? null, send_status: "pending", sent_at: null, failed_at: null, error_message: null }).select("id,sequence_number,resend_email_id,send_status,error_message,provider_idempotency_key").single();
    if (!inserted.error) delivery = inserted.data as DeliveryRow;
    else if (inserted.error.code !== "23505") throw inserted.error;
    else {
      const duplicate = await input.supabase.from("reserved_seat_email_deliveries").select("id,sequence_number,resend_email_id,send_status,error_message,provider_idempotency_key").eq("request_id", input.requestId).maybeSingle();
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) return existingResult(link.id, duplicate.data as DeliveryRow);
    }
  }
  if (!delivery) return { reservationId: link.id, outcome: "failed", reason: null, deliveryId: null, sequenceNumber: null, resendEmailId: null, error: "Unable to claim a reminder delivery." };

  let seatSelectionUrl: string;
  try {
    seatSelectionUrl = buildReservedSeatSelectionUrl(link.selection_token);
  } catch (error) {
    const message = safeError(error instanceof Error ? error.message : null);
    await input.supabase.from("reserved_seat_email_deliveries").update({ send_status: "failed", failed_at: new Date().toISOString(), error_message: message }).eq("id", delivery.id);
    return { reservationId: link.id, outcome: "failed", reason: null, deliveryId: delivery.id, sequenceNumber: delivery.sequence_number, resendEmailId: null, error: message };
  }

  const result = await sendEmail({ customerName: link.customer_name, customerEmail: link.email!, showName: show.name, showDate: show.show_date, remainingSeats: eligibility.remainingSeats, seatSelectionUrl }, { idempotencyKey: delivery.provider_idempotency_key, tags: [{ name: "show_id", value: show.id }, { name: "reservation_id", value: link.id }, { name: "email_type", value: "reserved_seat_reminder" }, { name: "delivery_id", value: delivery.id }] });
  if (!result.success) {
    const message = safeError(result.error);
    await input.supabase.from("reserved_seat_email_deliveries").update({ send_status: "failed", failed_at: new Date().toISOString(), error_message: message }).eq("id", delivery.id);
    return { reservationId: link.id, outcome: "failed", reason: null, deliveryId: delivery.id, sequenceNumber: delivery.sequence_number, resendEmailId: null, error: message };
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await input.supabase.from("reserved_seat_email_deliveries").update({ send_status: "accepted", resend_email_id: result.resendId, sent_at: sentAt, failed_at: null, error_message: null }).eq("id", delivery.id);
  if (updateError) throw updateError;
  const { error: linkStatusError } = await input.supabase.from("show_reserved_seating_links").update({ last_email_error: null }).eq("id", link.id).eq("show_id", link.show_id);
  if (linkStatusError) console.error("Reserved-seat reminder sent, but the current link error status could not be cleared.", linkStatusError);
  return { reservationId: link.id, outcome: "sent", reason: null, deliveryId: delivery.id, sequenceNumber: delivery.sequence_number, resendEmailId: result.resendId, error: null };
}

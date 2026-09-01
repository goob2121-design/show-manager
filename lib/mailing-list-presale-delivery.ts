import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveTicketSaleStatus } from "@/lib/ticket-sale-status";
import { MAILING_LIST_PRESALE_SUBJECT, sendMailingListPresaleAccessEmail } from "@/lib/mailing-list-presale-email";

type PresaleShow = {
  id: string;
  name: string;
  show_date: string;
  ticket_link: string | null;
  ticket_sale_status: unknown;
  presale_starts_at: string | null;
  public_sale_starts_at: string | null;
  presale_access_code: string | null;
};

export function isActiveMailingListPresale(show: PresaleShow, now = new Date()) {
  return effectiveTicketSaleStatus(show, now) === "presale";
}

export async function sendAutomaticMailingListPresaleAccess(input: {
  supabase: SupabaseClient;
  subscriberId: string;
  email: string;
  firstName: string;
  apiKey: string | undefined;
  now?: Date;
}) {
  try {
    const now = input.now ?? new Date();
    const today = now.toISOString().slice(0, 10);
    const { data: show, error: showError } = await input.supabase.from("shows")
      .select("id,name,show_date,ticket_link,ticket_sale_status,presale_starts_at,public_sale_starts_at,presale_access_code")
      .eq("is_archived", false).gte("show_date", today).order("show_date", { ascending: true }).limit(1).maybeSingle();
    if (showError) throw showError;
    const currentShow = show as PresaleShow | null;
    if (!currentShow || !isActiveMailingListPresale(currentShow, now)) return { status: "not_active" as const };
    const ticketUrl = currentShow.ticket_link?.trim() ?? "";
    if (!/^https:\/\//i.test(ticketUrl)) return { status: "missing_ticket_url" as const };

    const providerIdempotencyKey = `mailing-list-presale-${currentShow.id}-${input.subscriberId}`;
    const { data: delivery, error: claimError } = await input.supabase.from("mailing_list_presale_deliveries").insert({
      subscriber_id: input.subscriberId,
      show_id: currentShow.id,
      recipient: input.email,
      subject: MAILING_LIST_PRESALE_SUBJECT,
      ticket_url_snapshot: ticketUrl,
      provider_idempotency_key: providerIdempotencyKey,
      send_status: "pending",
    }).select("id").single();
    if (claimError?.code === "23505") return { status: "duplicate" as const };
    if (claimError) throw claimError;

    const result = await sendMailingListPresaleAccessEmail({
      email: input.email,
      firstName: input.firstName,
      showName: currentShow.name,
      ticketUrl,
      publicSaleStartsAt: currentShow.public_sale_starts_at,
      presaleCode: currentShow.presale_access_code,
      apiKey: input.apiKey,
      idempotencyKey: providerIdempotencyKey,
    });
    const completedAt = new Date().toISOString();
    if (!result.sent) {
      await input.supabase.from("mailing_list_presale_deliveries").update({ send_status: "failed", failed_at: completedAt, error_message: result.errorMessage, updated_at: completedAt }).eq("id", delivery.id);
      return { status: "failed" as const, errorMessage: result.errorMessage };
    }
    await input.supabase.from("mailing_list_presale_deliveries").update({ send_status: "accepted", resend_message_id: result.resendMessageId, sent_at: completedAt, error_message: null, updated_at: completedAt }).eq("id", delivery.id);
    return { status: "sent" as const, resendMessageId: result.resendMessageId };
  } catch (error) {
    console.error("Automatic mailing-list presale email failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return { status: "failed" as const, errorMessage: error instanceof Error ? error.message : "Unknown error" };
  }
}

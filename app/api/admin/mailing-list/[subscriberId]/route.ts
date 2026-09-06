import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { getEffectiveTicketSaleState } from "@/lib/ticket-sale-status";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Mailing list is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function authorized(slug: string) {
  const store = await cookies();
  return Boolean(slug && verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value));
}
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function GET(request: NextRequest, context: { params: Promise<{ subscriberId: string }> }) {
  try {
    const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
    if (!(await authorized(slug))) return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 401 });
    const { subscriberId } = await context.params;
    if (!validUuid(subscriberId)) return NextResponse.json({ success: false, error: "Invalid subscriber." }, { status: 400 });
    const supabase = db();
    const { data: subscriber, error: subscriberError } = await supabase.from("mailing_list_subscribers")
      .select("id,email,first_name,last_name,status,source,subscribed_at,unsubscribed_at,last_campaign_at,created_at,updated_at")
      .eq("id", subscriberId).maybeSingle();
    if (subscriberError) throw subscriberError;
    if (!subscriber) return NextResponse.json({ success: false, error: "Subscriber was not found." }, { status: 404 });
    const { data: deliveries, error: deliveryError } = await supabase.from("mailing_list_presale_deliveries")
      .select("id,recipient,subject,delivery_source,send_status,resend_message_id,error_message,sent_at,failed_at,created_at,show:shows(id,name,show_date,is_archived,ticket_link,ticket_sale_status,presale_starts_at,public_sale_starts_at),events:mailing_list_presale_delivery_events(id,presale_delivery_attempt_id,resend_message_id,event_type,provider_occurred_at,received_at,recipient,clicked_url,detail),attempts:mailing_list_presale_delivery_attempts(id,attempt_type,recipient,subject,ticket_url_snapshot,presale_code_snapshot,rendered_text_snapshot,administrative_reason,resend_message_id,send_status,error_message,sent_at,failed_at,requested_at,events:mailing_list_presale_delivery_events(id,presale_delivery_attempt_id,resend_message_id,event_type,provider_occurred_at,received_at,recipient,clicked_url,detail))")
      .eq("subscriber_id", subscriberId).order("created_at", { ascending: false });
    if (deliveryError) throw deliveryError;
    const enriched = (deliveries ?? []).map((delivery) => {
      const rawShow = Array.isArray(delivery.show) ? delivery.show[0] : delivery.show;
      return { ...delivery, show: rawShow ? { ...rawShow, effective_ticket_sale_status: getEffectiveTicketSaleState(rawShow).status } : null };
    });
    return NextResponse.json({ success: true, subscriber, presaleDeliveries: enriched });
  } catch (error) {
    console.error("Mailing-list subscriber detail failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to load subscriber details." }, { status: 500 });
  }
}

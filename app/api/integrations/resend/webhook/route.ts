import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { classifyReservedSeatEmailClickTarget } from "@/lib/reserved-seat-email-tracking";
import { getResendWebhookHeaderValues, verifyResendWebhookPayload } from "@/lib/resend-webhook";

export const runtime = "nodejs";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing server-side Supabase environment variables.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isDuplicateInsertError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "23505" || error.message?.toLowerCase().includes("duplicate key") === true;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  if (!webhookSecret) {
    return NextResponse.json({ success: false, error: "Webhook signing secret is not configured." }, { status: 500 });
  }

  const payloadText = await request.text();
  if (!payloadText.trim()) {
    return NextResponse.json({ success: false, error: "Webhook payload is required." }, { status: 400 });
  }

  let event;
  try {
    event = verifyResendWebhookPayload(payloadText, request.headers, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    const status = /unsupported webhook event type/i.test(message) || /malformed/i.test(message) ? 400 : 401;
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const supabase = createServiceRoleSupabaseClient();
  const resendEmailId = event.data.email_id?.trim() ?? "";
  if (!resendEmailId) {
    return NextResponse.json({ success: false, error: "Webhook payload is missing data.email_id." }, { status: 400 });
  }

  const { data: links, error: linksError } = await supabase
    .from("show_reserved_seating_links")
    .select("id")
    .eq("resend_email_id", resendEmailId);

  if (linksError) {
    console.error("Resend webhook link lookup failed.", {
      message: linksError.message,
      emailId: resendEmailId,
      type: event.type,
    });
    return NextResponse.json({ success: false, error: "Unable to match webhook event." }, { status: 500 });
  }

  if (!links?.length) {
    console.warn("Resend webhook received for unmatched reserved-seat email.", {
      emailId: resendEmailId,
      type: event.type,
    });
    return NextResponse.json({ success: true, matched: false });
  }

  if (links.length > 1) {
    console.error("Resend webhook found multiple reserved-seat matches for one email ID.", {
      emailId: resendEmailId,
      type: event.type,
      matchCount: links.length,
    });
    return NextResponse.json({ success: true, matched: false });
  }

  const clickTarget = event.type === "email.clicked"
    ? classifyReservedSeatEmailClickTarget(event.data.click?.link ?? null)
    : null;
  const headerValues = getResendWebhookHeaderValues(request.headers);

  const { error: insertError } = await supabase
    .from("reserved_seat_email_events")
    .insert({
      resend_email_id: resendEmailId,
      reserved_seating_link_id: links[0].id,
      event_type: event.type,
      event_created_at: event.created_at,
      recipient: event.data.to[0] ?? null,
      click_target: clickTarget,
      raw_event_id: headerValues.id || null,
    });

  if (insertError && !isDuplicateInsertError(insertError)) {
    console.error("Resend webhook event insert failed.", {
      message: insertError.message,
      code: insertError.code,
      emailId: resendEmailId,
      type: event.type,
    });
    return NextResponse.json({ success: false, error: "Unable to store webhook event." }, { status: 500 });
  }

  return NextResponse.json({ success: true, matched: true, duplicate: isDuplicateInsertError(insertError) });
}

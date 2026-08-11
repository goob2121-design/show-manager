import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import {
  getManualEmailSender,
  getManualEmailTemplate,
  isValidManualEmailAddress,
  MANUAL_EMAIL_REPLY_TO,
} from "@/lib/manual-email-center";

export const runtime = "nodejs";

type ManualEmailHistoryRow = {
  id: string;
  recipient_email: string;
  from_address: string;
  subject: string;
  template_key: string;
  send_status: "sent" | "failed";
  resend_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Email Center history is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function authorize(slug: string) {
  if (!slug) return { ok: false as const, status: 400, error: "A show slug is required." };
  const cookieStore = await cookies();
  if (!verifyAdminSessionCookieValue(slug, cookieStore.get(getAdminSessionCookieName(slug))?.value)) {
    return { ok: false as const, status: 401, error: "Admin access is required." };
  }

  const supabase = serviceClient();
  const { data: show, error } = await supabase
    .from("shows")
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!show) return { ok: false as const, status: 404, error: "Show was not found." };
  return { ok: true as const, supabase, show };
}

function publicHistory(row: ManualEmailHistoryRow) {
  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    fromAddress: row.from_address,
    subject: row.subject,
    templateKey: row.template_key,
    sendStatus: row.send_status,
    resendMessageId: row.resend_message_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

async function insertHistory(
  supabase: ReturnType<typeof serviceClient>,
  values: Omit<ManualEmailHistoryRow, "id" | "created_at"> & { show_id: string },
) {
  return supabase
    .from("manual_email_history")
    .insert(values)
    .select("id,recipient_email,from_address,subject,template_key,send_status,resend_message_id,error_message,created_at")
    .single();
}

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
    const access = await authorize(slug);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const { data, error } = await access.supabase
      .from("manual_email_history")
      .select("id,recipient_email,from_address,subject,template_key,send_status,resend_message_id,error_message,created_at")
      .eq("show_id", access.show.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      history: ((data ?? []) as ManualEmailHistoryRow[]).map(publicHistory),
    });
  } catch (error) {
    console.error("Email Center history lookup failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Unable to load recent sent emails." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json() as unknown;
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? rawBody as Record<string, unknown> : {};
    const slug = stringValue(body.slug);
    const access = await authorize(slug);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const recipientEmail = stringValue(body.recipientEmail).toLowerCase();
    const senderKey = stringValue(body.senderKey);
    const templateKey = stringValue(body.templateKey);
    const subject = stringValue(body.subject);
    const message = stringValue(body.message);
    const sender = getManualEmailSender(senderKey);
    const template = getManualEmailTemplate(templateKey);

    if (!isValidManualEmailAddress(recipientEmail)) {
      return NextResponse.json({ success: false, error: "Enter a valid recipient email address." }, { status: 400 });
    }
    if (!sender) {
      return NextResponse.json({ success: false, error: "Select a valid From address." }, { status: 400 });
    }
    if (!template) {
      return NextResponse.json({ success: false, error: "Select a valid email template." }, { status: 400 });
    }
    if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) {
      return NextResponse.json({ success: false, error: "Enter a subject of 200 characters or fewer." }, { status: 400 });
    }
    if (!message || message.length > 20000) {
      return NextResponse.json({ success: false, error: "Enter a message of 20,000 characters or fewer." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Resend is not configured." }, { status: 500 });
    }

    const { data, error: resendError } = await new Resend(apiKey).emails.send({
      from: sender.from,
      replyTo: MANUAL_EMAIL_REPLY_TO,
      to: recipientEmail,
      subject,
      text: message,
    });

    if (resendError) {
      const safeError = typeof resendError.message === "string"
        ? resendError.message.slice(0, 1000)
        : "Resend could not send this email.";
      const { error: historyError } = await insertHistory(access.supabase, {
        show_id: access.show.id,
        recipient_email: recipientEmail,
        from_address: sender.from,
        subject,
        template_key: template.key,
        send_status: "failed",
        resend_message_id: null,
        error_message: safeError,
      });
      if (historyError) {
        console.error("Email Center failed-send history insert failed.", { message: historyError.message });
      }
      return NextResponse.json(
        { success: false, error: "The email could not be sent. Please review the details and try again." },
        { status: 502 },
      );
    }

    const resendMessageId = data?.id ?? null;
    const { data: history, error: historyError } = await insertHistory(access.supabase, {
      show_id: access.show.id,
      recipient_email: recipientEmail,
      from_address: sender.from,
      subject,
      template_key: template.key,
      send_status: "sent",
      resend_message_id: resendMessageId,
      error_message: null,
    });
    if (historyError) {
      console.error("Email Center sent-history insert failed.", { message: historyError.message });
      return NextResponse.json({
        success: true,
        resendMessageId,
        history: null,
        warning: "The email was sent, but its history entry could not be saved.",
      });
    }

    return NextResponse.json({
      success: true,
      resendMessageId,
      history: publicHistory(history as ManualEmailHistoryRow),
    });
  } catch (error) {
    console.error("Email Center send failed.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Unable to send this email." },
      { status: 500 },
    );
  }
}

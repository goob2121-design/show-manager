import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanMailingListName, isValidMailingListEmail, normalizeMailingListEmail } from "@/lib/mailing-list";
import { sendMailingListWelcomeEmail, type MailingListWelcomeSendResult } from "@/lib/mailing-list-welcome-email";
import { subscribeMailingListContact } from "@/lib/mailing-list-subscription";
import { sendAutomaticMailingListPresaleAccess } from "@/lib/mailing-list-presale-delivery";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set(["https://www.cumberlandmountainmusic.com", "https://cumberlandmountainmusic.com"]);
const attempts = new Map<string, number[]>();

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Mailing list is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function limited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 8;
}

function welcomeEmailMetadata(result: MailingListWelcomeSendResult) {
  return {
    welcome_email: {
      attempted: result.attempted,
      sent: result.sent,
      resend_message_id: result.resendMessageId,
      error_message: result.errorMessage,
      from: result.from,
      reply_to: result.replyTo,
      updated_at: new Date().toISOString(),
    },
  };
}

async function recordWelcomeEmailResult(supabase: ReturnType<typeof db>, subscriberId: string, result: MailingListWelcomeSendResult) {
  const { error } = await supabase
    .from("mailing_list_subscribers")
    .update({ metadata: welcomeEmailMetadata(result), updated_at: new Date().toISOString() })
    .eq("id", subscriberId);
  if (error) console.error("Mailing-list welcome email metadata update failed.", { subscriberId, message: error.message });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(request.headers.get("origin")),
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return NextResponse.json({ success: false, error: "Origin is not allowed." }, { status: 403, headers });

  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(key)) return NextResponse.json({ success: false, error: "Please wait before trying again." }, { status: 429, headers });

  try {
    const raw = await request.json() as Record<string, unknown>;
    if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ success: true, status: "subscribed" }, { headers });

    const email = normalizeMailingListEmail(typeof raw.email === "string" ? raw.email : "");
    const firstName = cleanMailingListName(raw.firstName);
    const lastName = cleanMailingListName(raw.lastName);
    const resubscribe = raw.resubscribe === true;
    if (!isValidMailingListEmail(email)) return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400, headers });

    const supabase = db();
    const subscription = await subscribeMailingListContact(supabase, { email, firstName, lastName, source: "website", confirmResubscribe: resubscribe });
    if (subscription.status === "resubscribe_required") {
      return NextResponse.json({ success: true, status: "resubscribe_required", message: "This address was previously unsubscribed. Confirm that you want to rejoin." }, { headers });
    }
    if (subscription.status === "already_subscribed") return NextResponse.json({ success: true, status: "already_subscribed", message: "You’re already on the list — thanks for staying connected!" }, { headers });
    const subscriberId = subscription.subscriberId;
    const created = subscription.created;

    let welcomeEmailResult: MailingListWelcomeSendResult | null = null;
    if (created && subscriberId) {
      welcomeEmailResult = await sendMailingListWelcomeEmail({ subscriberId, email, firstName, apiKey: process.env.RESEND_API_KEY });
      await recordWelcomeEmailResult(supabase, subscriberId, welcomeEmailResult);
      if (welcomeEmailResult.sent) {
        console.info("Mailing-list welcome email sent.", { subscriberId, resendMessageId: welcomeEmailResult.resendMessageId });
      } else {
        console.error("Mailing-list welcome email failed.", {
          subscriberId,
          attempted: welcomeEmailResult.attempted,
          from: welcomeEmailResult.from,
          replyTo: welcomeEmailResult.replyTo,
          message: welcomeEmailResult.errorMessage,
        });
      }
    }

    if (subscriberId) {
      const presaleResult = await sendAutomaticMailingListPresaleAccess({
        supabase,
        subscriberId,
        email,
        firstName,
        apiKey: process.env.RESEND_API_KEY,
      });
      if (presaleResult.status === "sent") {
        console.info("Automatic mailing-list presale email sent.", { subscriberId, resendMessageId: presaleResult.resendMessageId });
      }
    }

    return NextResponse.json({
      success: true,
      status: "subscribed",
      message: "Thanks! You’re on the Cumberland Mountain Music Show mailing list.",
      subscriber_created: created,
      welcome_email_sent: welcomeEmailResult?.sent ?? false,
    }, { headers });
  } catch (error) {
    console.error("Mailing-list signup failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ success: false, error: "Unable to join the mailing list right now." }, { status: 500, headers });
  }
}

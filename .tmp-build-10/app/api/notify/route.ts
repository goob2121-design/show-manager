import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

// These environment variables must stay server-side only.
const defaultFromAddress = "onboarding@resend.dev";

type NotifyRequestBody = {
  subject?: unknown;
  html?: unknown;
};

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("Notification email failed: RESEND_API_KEY is not configured.");
      return NextResponse.json(
        { success: false, error: "Notification service is not configured." },
        { status: 500 },
      );
    }

    if (!process.env.NOTIFY_EMAIL) {
      console.error("Notification email failed: NOTIFY_EMAIL is not configured.");
      return NextResponse.json(
        { success: false, error: "Notification recipient is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as NotifyRequestBody;
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const html = typeof body.html === "string" ? body.html.trim() : "";

    if (!subject || !html) {
      return NextResponse.json(
        { success: false, error: "subject and html are required." },
        { status: 400 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || defaultFromAddress,
      to: process.env.NOTIFY_EMAIL,
      subject,
      html,
    });

    if (error) {
      console.error("Notification email failed while sending with Resend.", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Notification email route failed unexpectedly.", error);
    return NextResponse.json(
      { success: false, error: "Failed to send notification email." },
      { status: 500 },
    );
  }
}

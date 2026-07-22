import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";

const FROM_ADDRESS = "Cumberland Mountain Music Show <tickets@cumberlandmountainmusic.com>";
const TO_ADDRESS = "goob2121@gmail.com";

function sanitizedError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { name?: unknown; message?: unknown; statusCode?: unknown };
    return {
      name: typeof value.name === "string" ? value.name : undefined,
      message: typeof value.message === "string" ? value.message : "Resend request failed.",
      statusCode: typeof value.statusCode === "number" ? value.statusCode : undefined,
    };
  }

  return { message: error instanceof Error ? error.message : "Resend request failed." };
}

// Temporary admin-only endpoint for verifying Resend delivery configuration.
export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";

    if (!slug) {
      return NextResponse.json(
        { success: false, resendId: null, error: "A show slug is required." },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const hasAdminAccess = verifyAdminSessionCookieValue(
      slug,
      cookieStore.get(getAdminSessionCookieName(slug))?.value,
    );

    if (!hasAdminAccess) {
      return NextResponse.json(
        { success: false, resendId: null, error: "Admin access is required." },
        { status: 401 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("Resend test failed: RESEND_API_KEY is not configured.");
      return NextResponse.json(
        { success: false, resendId: null, error: "Resend is not configured." },
        { status: 500 },
      );
    }

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      subject: "StageFlow Resend Test",
      html: [
        "<h2>StageFlow Email Test</h2>",
        "<p>If you're reading this, Resend is working correctly.</p>",
        "<p>This is a temporary test email.</p>",
        "<p>No ticket purchase or Square integration was involved.</p>",
        "<p>&mdash; StageFlow</p>",
      ].join(""),
    });

    if (error) {
      const safeError = sanitizedError(error);
      console.error("Resend test send failed.", safeError);
      return NextResponse.json(
        { success: false, resendId: null, error: safeError.message },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, resendId: data?.id ?? null, error: null });
  } catch (error) {
    const safeError = sanitizedError(error);
    console.error("Resend test route failed.", safeError);
    return NextResponse.json(
      { success: false, resendId: null, error: safeError.message },
      { status: 500 },
    );
  }
}

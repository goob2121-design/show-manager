import { NextResponse } from "next/server";
import { getSignedR2TestFileUrl } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { key?: string } | null;

    if (!payload?.key) {
      return NextResponse.json(
        { success: false, error: "A file key is required to open an R2 test file." },
        { status: 400 },
      );
    }

    const url = getSignedR2TestFileUrl(payload.key);
    return NextResponse.json({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign the R2 test file URL.";
    console.error("Failed to sign R2 test file URL.");
    console.error("R2 signed URL error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

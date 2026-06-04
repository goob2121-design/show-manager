import { NextResponse } from "next/server";
import { deleteR2TestFile, listR2TestFiles } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await listR2TestFiles();
    return NextResponse.json({ success: true, files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list R2 test files.";
    console.error("Failed to list R2 test files.");
    console.error("R2 list error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as { key?: string } | null;

    if (!payload?.key) {
      return NextResponse.json(
        { success: false, error: "A file key is required to delete an R2 test file." },
        { status: 400 },
      );
    }

    await deleteR2TestFile(payload.key);
    return NextResponse.json({ success: true, deletedKey: payload.key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete the R2 test file.";
    console.error("Failed to delete R2 test file.");
    console.error("R2 delete error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

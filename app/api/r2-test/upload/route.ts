import { NextResponse } from "next/server";
import { uploadR2TestFile } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Choose a file before uploading to R2." },
        { status: 400 },
      );
    }

    const uploadedFile = await uploadR2TestFile(file);
    return NextResponse.json({ success: true, file: uploadedFile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload the R2 test file.";
    console.error("Failed to upload R2 test file.");
    console.error("R2 upload error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

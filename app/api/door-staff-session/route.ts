import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  createDoorStaffSessionCookieValue,
  doorStaffSessionMaxAgeSeconds,
  getDoorStaffSessionCookieName,
  verifyDoorStaffPassword,
} from "@/lib/door-staff-session";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Door Staff login is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { slug?: unknown; username?: unknown; password?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!slug || !username || !password) {
      return NextResponse.json({ success: false, error: "Username and password are required." }, { status: 400 });
    }

    const supabase = serviceClient();
    const { data: show, error: showError } = await supabase.from("shows").select("id,slug").eq("slug", slug).maybeSingle();
    if (showError) throw showError;
    if (!show) return NextResponse.json({ success: false, error: "Unable to sign in with those credentials." }, { status: 401 });

    const { data: account, error: accountError } = await supabase
      .from("door_staff_accounts")
      .select("id,password_hash,is_active")
      .eq("show_id", show.id)
      .eq("username", username)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.is_active || !(await verifyDoorStaffPassword(password, account.password_hash))) {
      return NextResponse.json({ success: false, error: "Unable to sign in with those credentials." }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(getDoorStaffSessionCookieName(show.slug), createDoorStaffSessionCookieValue(show.id, show.slug), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: doorStaffSessionMaxAgeSeconds,
    });
    return response;
  } catch (error) {
    console.error("Door Staff session route failed.", error);
    return NextResponse.json({ success: false, error: "Unable to sign in right now." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!slug) return NextResponse.json({ success: false, error: "Show slug is required." }, { status: 400 });
  const response = NextResponse.json({ success: true });
  response.cookies.set(getDoorStaffSessionCookieName(slug), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}


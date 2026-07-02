import { NextResponse } from "next/server";
import { adminSessionMaxAgeSeconds, createAdminSessionCookieValue, getAdminSessionCookieName } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const expectedPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
    const body = (await request.json()) as { slug?: unknown; password?: unknown };
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!slug) return NextResponse.json({ success: false, error: "Show slug is required." }, { status: 400 });
    if (expectedPassword.trim() && password !== expectedPassword) {
      return NextResponse.json({ success: false, error: "Admin password was not correct." }, { status: 401 });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(getAdminSessionCookieName(slug), createAdminSessionCookieValue(slug), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: adminSessionMaxAgeSeconds,
    });
    return response;
  } catch (error) {
    console.error("Admin session route failed.", error);
    return NextResponse.json({ success: false, error: "Unable to create admin session." }, { status: 500 });
  }
}

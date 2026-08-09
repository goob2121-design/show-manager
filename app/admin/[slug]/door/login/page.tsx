import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DoorStaffLoginForm } from "@/app/components/door-staff-login-form";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { getDoorStaffSessionCookieName, verifyDoorStaffSessionCookieValue } from "@/lib/door-staff-session";

export const metadata: Metadata = { title: "Door Staff Login | StageFlow" };

export default async function DoorStaffLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await cookies();
  const hasAdmin = verifyAdminSessionCookieValue(slug, store.get(getAdminSessionCookieName(slug))?.value);
  const hasDoorStaff = verifyDoorStaffSessionCookieValue(slug, store.get(getDoorStaffSessionCookieName(slug))?.value);
  if (hasAdmin || hasDoorStaff) redirect(`/admin/${slug}/door`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <Image src="/cmms-logo.png" alt="Cumberland Mountain Music Show" width={500} height={300} className="mx-auto h-24 w-auto object-contain" priority />
        <div className="my-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">StageFlow</p>
          <h1 className="mt-2 text-3xl font-semibold">Door Staff Login</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to Door Mode for this show.</p>
        </div>
        <DoorStaffLoginForm slug={slug} />
        <p className="mt-6 text-center text-xs text-slate-500">Administrator? <Link href={`/admin/${slug}`} className="text-slate-300 underline hover:text-white">Open Admin login</Link></p>
      </section>
    </main>
  );
}

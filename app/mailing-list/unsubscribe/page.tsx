import { UnsubscribeForm } from "./unsubscribe-form";

export default async function MailingListUnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="min-h-screen bg-slate-100 px-4 py-16"><section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl"><header className="bg-[#071426] px-6 py-8 text-center"><h1 className="text-2xl font-black text-white">Cumberland Mountain Music Show</h1><p className="mt-2 font-bold text-amber-400">Mailing List Preferences</p></header><div className="p-8"><UnsubscribeForm token={token} /></div></section></main>;
}

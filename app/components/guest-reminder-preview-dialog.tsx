"use client";

import type { GuestReminderItem } from "@/lib/guest-reminder";
import { buildGuestReminderEmail } from "@/lib/email/guest-reminder-email-content";

export type GuestReminderPreview = {
  guestProfileId: string;
  subject: string;
  recipient: string;
  missingItems: GuestReminderItem[];
  html: string;
  guestName: string;
  portalUrl: string;
};

export function GuestReminderPreviewDialog({
  preview,
  note,
  isSending,
  onNoteChange,
  onCancel,
  onSend,
}: {
  preview: GuestReminderPreview;
  note: string;
  isSending: boolean;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const complete = preview.missingItems.length === 0;
  const renderedEmail = buildGuestReminderEmail({ email: preview.recipient, guestName: preview.guestName, portalUrl: preview.portalUrl, missingItems: preview.missingItems, additionalNote: note });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSending) onCancel(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="guest-reminder-preview-title" className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="border-b border-stone-200 px-5 py-4">
          <h2 id="guest-reminder-preview-title" className="text-xl font-semibold text-stone-900">Guest Reminder Email Preview</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-stone-500">Subject</dt><dd className="text-stone-900">{renderedEmail.subject}</dd></div>
            <div><dt className="font-semibold text-stone-500">Recipient</dt><dd className="text-stone-900">{preview.recipient}</dd></div>
          </dl>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Missing Items</h3>
              {complete ? <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><strong>Great news!</strong><br />Everything required has been received. You can still send this message so the guest can review or update their Guest Portal.</div> : <ul className="mt-2 space-y-1 text-sm text-stone-700">{preview.missingItems.map((item) => <li key={item}>✓ {item}</li>)}</ul>}
            </div>
            <label className="block text-sm font-semibold text-stone-900">Additional Note (Optional)
              <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={isSending} rows={6} className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100" placeholder="Add a personal message..." />
            </label>
          </aside>
          <div className="min-h-[460px] overflow-hidden rounded-xl border border-stone-300 bg-stone-100">
            <iframe title="Complete reminder email preview" srcDoc={renderedEmail.html} className="h-[560px] w-full bg-white" />
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-stone-200 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={isSending} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700">Cancel</button>
          <button type="button" onClick={onSend} disabled={isSending} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400">{isSending ? "Sending..." : "Send Reminder"}</button>
        </footer>
      </section>
    </div>
  );
}
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import {
  getManualEmailTemplate,
  manualEmailSenders,
  manualEmailTemplates,
  MANUAL_EMAIL_REPLY_TO,
  type ManualEmailSenderKey,
  type ManualEmailTemplateKey,
} from "@/lib/manual-email-center";

type ManualEmailHistoryItem = {
  id: string;
  recipientEmail: string;
  fromAddress: string;
  subject: string;
  templateKey: string;
  sendStatus: "sent" | "failed";
  resendMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type EmailCenterResponse = {
  success?: boolean;
  error?: string;
  warning?: string;
  resendMessageId?: string | null;
  history?: ManualEmailHistoryItem | null;
};

function formatSentAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function EmailCenter({ slug }: { slug: string }) {
  const initialTemplate = manualEmailTemplates[0];
  const [senderKey, setSenderKey] = useState<ManualEmailSenderKey>("info");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [templateKey, setTemplateKey] = useState<ManualEmailTemplateKey>(initialTemplate.key);
  const [subject, setSubject] = useState<string>(initialTemplate.subject);
  const [message, setMessage] = useState(initialTemplate.message);
  const [history, setHistory] = useState<ManualEmailHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<"success" | "error">("success");

  const templateLabels = useMemo(
    () => Object.fromEntries(manualEmailTemplates.map((template) => [template.key, template.label])),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoadingHistory(true);
      setHistoryError(null);
      try {
        const response = await fetch(`/api/admin/email-center?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const payload = await response.json() as {
          success?: boolean;
          error?: string;
          history?: ManualEmailHistoryItem[];
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load recent sent emails.");
        }
        if (!cancelled) setHistory(payload.history ?? []);
      } catch (error) {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Unable to load recent sent emails.");
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function handleTemplateChange(nextKey: ManualEmailTemplateKey) {
    const template = getManualEmailTemplate(nextKey);
    if (!template) return;
    setTemplateKey(nextKey);
    setSubject(template.subject);
    setMessage(template.message);
    setResultMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;

    setIsSending(true);
    setResultMessage(null);
    try {
      const response = await fetch("/api/admin/email-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          senderKey,
          recipientEmail,
          templateKey,
          subject,
          message,
        }),
      });
      const payload = await response.json() as EmailCenterResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to send this email.");
      }

      if (payload.history) {
        setHistory((current) => [payload.history as ManualEmailHistoryItem, ...current].slice(0, 50));
      }
      setResultTone("success");
      setResultMessage(payload.warning || "Email sent successfully.");
    } catch (error) {
      setResultTone("error");
      setResultMessage(error instanceof Error ? error.message : "Unable to send this email.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-stone-950 px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6">
        <AdminQuickNav slug={slug} currentView="email-center" />

        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">StageFlow Admin</p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Email Center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Send manual Cumberland Mountain Music Show messages through the existing Resend configuration.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://webmail.porkbun.com/?_task=mail&_mbox=INBOX"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
            >
              Open Webmail
            </a>
            <Link
              href={`/admin/${encodeURIComponent(slug)}`}
              className="inline-flex w-fit rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.1]"
            >
              Back to Admin
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
          <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                From
                <select
                  value={senderKey}
                  onChange={(event) => setSenderKey(event.target.value as ManualEmailSenderKey)}
                  className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                >
                  {manualEmailSenders.map((sender) => (
                    <option key={sender.key} value={sender.key}>
                      {sender.label} - {sender.address}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-slate-400">Reply-To: {MANUAL_EMAIL_REPLY_TO}</span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                To
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="recipient@example.com"
                  className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Template
              <select
                value={templateKey}
                onChange={(event) => handleTemplateChange(event.target.value as ManualEmailTemplateKey)}
                className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
              >
                {manualEmailTemplates.map((template) => (
                  <option key={template.key} value={template.key}>{template.label}</option>
                ))}
              </select>
              <span className="text-xs font-normal text-slate-400">
                Selecting a template fills the fields below. Nothing is sent until you press Send Email.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Subject
              <input
                type="text"
                required
                maxLength={200}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Message
              <textarea
                required
                maxLength={20000}
                rows={18}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-72 resize-y rounded-xl border border-white/15 bg-slate-950 px-3 py-3 font-mono text-sm leading-6 text-white outline-none transition focus:border-emerald-400"
              />
            </label>

            {resultMessage ? (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm ${
                  resultTone === "success"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-400/30 bg-rose-500/10 text-rose-100"
                }`}
              >
                {resultMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSending}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300 sm:w-fit sm:min-w-44"
            >
              {isSending ? "Sending..." : "Send Email"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-2xl sm:p-7">
          <div>
            <h2 className="text-xl font-black text-white">Recent Sent Emails</h2>
            <p className="mt-1 text-sm text-slate-400">The 50 most recent manual Email Center attempts for this show.</p>
          </div>

          {isLoadingHistory ? <p className="mt-5 text-sm text-slate-400">Loading email history...</p> : null}
          {historyError ? (
            <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {historyError}
            </p>
          ) : null}
          {!isLoadingHistory && !historyError && history.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-slate-400">
              No manual emails have been sent for this show yet.
            </p>
          ) : null}

          {history.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Date / Time</th>
                    <th className="px-3 py-3">Recipient</th>
                    <th className="px-3 py-3">From</th>
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Template</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Resend ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {history.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-300">{formatSentAt(item.createdAt)}</td>
                      <td className="px-3 py-3 text-white">{item.recipientEmail}</td>
                      <td className="min-w-56 px-3 py-3 text-slate-300">{item.fromAddress}</td>
                      <td className="min-w-64 px-3 py-3 text-slate-200">{item.subject}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-300">{templateLabels[item.templateKey] ?? item.templateKey}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${
                          item.sendStatus === "sent"
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                            : "border-rose-400/30 bg-rose-500/10 text-rose-100"
                        }`}>
                          {item.sendStatus}
                        </span>
                        {item.errorMessage ? <p className="mt-2 min-w-52 text-xs text-rose-200">{item.errorMessage}</p> : null}
                      </td>
                      <td className="max-w-64 break-all px-3 py-3 text-xs text-slate-400">{item.resendMessageId ?? "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

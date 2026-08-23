import { Resend } from "resend";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { MANUAL_EMAIL_REPLY_TO } from "@/lib/manual-email-center";
import { MAILING_LIST_WELCOME_SENDER } from "@/lib/mailing-list-welcome-email";

export const MAILING_LIST_PRESALE_SUBJECT = "Your CMMS Early Access Ticket Link";

type PresaleEmailClient = {
  emails: {
    send: (
      payload: { from: string; replyTo: string; to: string; subject: string; html: string; text: string },
      options: { idempotencyKey: string },
    ) => Promise<{ data?: { id?: string | null } | null; error?: { message?: string | null } | null }>;
  };
};

export type MailingListPresaleSendResult = {
  sent: boolean;
  resendMessageId: string | null;
  errorMessage: string | null;
};

function safeErrorMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message.slice(0, 1000);
  }
  return "Early Access email could not be sent.";
}

function formatPublicSaleDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York" }).format(date);
}

export function buildMailingListPresaleAccessEmail(input: {
  firstName: string;
  showName: string;
  ticketUrl: string;
  publicSaleStartsAt: string | null;
}) {
  const greeting = input.firstName.trim() ? `Hi ${input.firstName.trim()},` : "Hi there,";
  const publicSaleDate = formatPublicSaleDate(input.publicSaleStartsAt);
  return renderEmailCenterEmail({
    heading: "Your CMMS Early Access Ticket Link",
    message: `${greeting}\n\nSince you're on the CMMS Mailing List, I wanted to send you the early-access ticket link for ${input.showName}.${publicSaleDate ? `\n\nTickets open to the general public on ${publicSaleDate}. This gives you the first opportunity to purchase tickets and choose from the available reserved seats.` : ""}\n\nThanks for supporting the Cumberland Mountain Music Show!`,
    ctaLabel: "EARLY ACCESS TICKETS",
    ctaUrl: input.ticketUrl,
  });
}

export async function sendMailingListPresaleAccessEmail(
  input: {
    email: string;
    firstName: string;
    showName: string;
    ticketUrl: string;
    publicSaleStartsAt: string | null;
    apiKey: string | undefined;
    idempotencyKey: string;
  },
  clientFactory: (apiKey: string) => PresaleEmailClient = (apiKey) => new Resend(apiKey),
): Promise<MailingListPresaleSendResult> {
  if (!input.apiKey) return { sent: false, resendMessageId: null, errorMessage: "RESEND_API_KEY is not configured." };
  try {
    const content = buildMailingListPresaleAccessEmail(input);
    const result = await clientFactory(input.apiKey).emails.send({
      from: MAILING_LIST_WELCOME_SENDER.from,
      replyTo: MANUAL_EMAIL_REPLY_TO,
      to: input.email,
      subject: MAILING_LIST_PRESALE_SUBJECT,
      html: content.html,
      text: content.text,
    }, { idempotencyKey: input.idempotencyKey });
    if (result.error) return { sent: false, resendMessageId: null, errorMessage: safeErrorMessage(result.error) };
    return { sent: true, resendMessageId: result.data?.id ?? null, errorMessage: null };
  } catch (error) {
    return { sent: false, resendMessageId: null, errorMessage: safeErrorMessage(error) };
  }
}

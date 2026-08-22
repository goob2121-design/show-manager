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
  const greeting = input.firstName ? `Thanks for joining us, ${input.firstName}!` : "Thanks for joining us!";
  const publicSaleDate = formatPublicSaleDate(input.publicSaleStartsAt);
  return renderEmailCenterEmail({
    heading: "Your CMMS Early Access Ticket Link",
    message: `${greeting}\n\nEarly Access is currently open for ${input.showName}. Use the link below to purchase your tickets before public sales begin and get first choice of available reserved seats.${publicSaleDate ? `\n\nPublic ticket sales begin ${publicSaleDate}.` : ""}\n\nWe’ll also keep you updated about upcoming Cumberland Mountain Music Shows, special announcements, and occasional exclusive discounts.\n\nIf you don’t see future CMMS emails, check your Spam, Promotions, or Social folders.`,
    ctaLabel: "GET EARLY ACCESS TICKETS",
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

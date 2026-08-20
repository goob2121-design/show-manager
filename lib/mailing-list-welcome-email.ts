import { Resend } from "resend";
import { renderEmailCenterEmail } from "@/lib/email-center-renderer";
import { MANUAL_EMAIL_REPLY_TO, manualEmailSenders } from "@/lib/manual-email-center";

export const MAILING_LIST_WELCOME_SUBJECT = "Welcome to the Cumberland Mountain Music Show mailing list";
export const MAILING_LIST_WELCOME_SENDER = manualEmailSenders.find((item) => item.key === "info")!;

export type MailingListWelcomeSendInput = {
  subscriberId: string;
  email: string;
  firstName: string;
  apiKey: string | undefined;
};

export type MailingListWelcomeSendResult = {
  attempted: boolean;
  sent: boolean;
  resendMessageId: string | null;
  errorMessage: string | null;
  from: string;
  replyTo: string;
};

type ResendEmailClient = {
  emails: {
    send: (
      payload: {
        from: string;
        replyTo: string;
        to: string;
        subject: string;
        html: string;
        text: string;
      },
      options: { idempotencyKey: string },
    ) => Promise<{ data?: { id?: string | null } | null; error?: { message?: string | null } | null }>;
  };
};

function safeErrorMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message.slice(0, 1000);
  }
  return "Welcome email could not be sent.";
}

export function buildMailingListWelcomeEmail(firstName: string) {
  return renderEmailCenterEmail({
    heading: "Welcome to the CMMS mailing list",
    message: `Thanks${firstName ? `, ${firstName}` : ""}! You’re on the Cumberland Mountain Music Show mailing list. We’ll keep you updated about upcoming shows and CMMS news.`,
  });
}

export async function sendMailingListWelcomeEmail(
  input: MailingListWelcomeSendInput,
  clientFactory: (apiKey: string) => ResendEmailClient = (apiKey) => new Resend(apiKey),
): Promise<MailingListWelcomeSendResult> {
  const base = { from: MAILING_LIST_WELCOME_SENDER.from, replyTo: MANUAL_EMAIL_REPLY_TO };
  if (!input.apiKey) {
    return { attempted: false, sent: false, resendMessageId: null, errorMessage: "RESEND_API_KEY is not configured.", ...base };
  }

  try {
    const content = buildMailingListWelcomeEmail(input.firstName);
    const result = await clientFactory(input.apiKey).emails.send({
      from: base.from,
      replyTo: base.replyTo,
      to: input.email,
      subject: MAILING_LIST_WELCOME_SUBJECT,
      html: content.html,
      text: content.text,
    }, { idempotencyKey: `mailing-list-welcome-${input.subscriberId}` });

    if (result.error) {
      return { attempted: true, sent: false, resendMessageId: null, errorMessage: safeErrorMessage(result.error), ...base };
    }

    return { attempted: true, sent: true, resendMessageId: result.data?.id ?? null, errorMessage: null, ...base };
  } catch (error) {
    return { attempted: true, sent: false, resendMessageId: null, errorMessage: safeErrorMessage(error), ...base };
  }
}

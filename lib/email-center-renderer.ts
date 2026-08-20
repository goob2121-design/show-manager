export const EMAIL_CENTER_LOGO_URL = "https://stageflow.cumberlandmountainmusic.com/cmms-logo.png";

export type EmailCenterRenderInput = {
  heading?: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function linkedText(value: string) {
  const pattern = /(https:\/\/[^\s<]+)/g;
  let cursor = 0;
  let html = "";
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(cursor, index));
    let url = match[0];
    let suffix = "";
    while (/[),.!?]$/.test(url)) { suffix = url.slice(-1) + suffix; url = url.slice(0, -1); }
    html += `<a href="${escapeHtml(url)}" style="color:#075985;font-weight:700;text-decoration:underline;">${escapeHtml(url)}</a>${escapeHtml(suffix)}`;
    cursor = index + match[0].length;
  }
  return html + escapeHtml(value.slice(cursor));
}

function messageHtml(message: string) {
  return message.trim().split(/\n{2,}/).map((paragraph) =>
    `<p style="margin:0 0 18px;color:#1e293b;font-size:16px;line-height:1.65;">${linkedText(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}

export function renderEmailCenterEmail(input: EmailCenterRenderInput) {
  const heading = input.heading?.trim() ?? "";
  const message = input.message.trim();
  const ctaLabel = input.ctaLabel?.trim() ?? "";
  const ctaUrl = input.ctaUrl?.trim() ?? "";
  const showCta = Boolean(ctaLabel && /^https:\/\//i.test(ctaUrl));
  const unsubscribeUrl = input.unsubscribeUrl?.trim() ?? "";
  const html = `<!doctype html><html><body style="margin:0;background:#e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#e2e8f0;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;"><tr><td align="center" style="background:#071426;padding:24px 20px;"><img src="${EMAIL_CENTER_LOGO_URL}" alt="Cumberland Mountain Music Show" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;"><div style="margin-top:10px;color:#fbbf24;font-size:14px;font-weight:700;letter-spacing:.03em;">Big-Time Show &bull; Small-Town Hospitality</div></td></tr><tr><td style="padding:32px 28px;">${heading ? `<h1 style="margin:0 0 22px;color:#071426;font-size:28px;line-height:1.25;">${escapeHtml(heading)}</h1>` : ""}${messageHtml(message)}${showCta ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 8px;"><tr><td align="center" bgcolor="#d89b2b" style="border-radius:6px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 24px;color:#071426;font-size:16px;font-weight:700;text-decoration:none;">${escapeHtml(ctaLabel)}</a></td></tr></table>` : ""}</td></tr><tr><td align="center" style="background:#071426;padding:28px 22px;color:#cbd5e1;font-size:13px;line-height:1.8;"><strong style="color:#ffffff;">Cumberland Mountain Music Show</strong><br>Big-Time Show, Small-Town Hospitality<br><a href="https://www.cumberlandmountainmusic.com" style="color:#fbbf24;font-weight:700;">www.cumberlandmountainmusic.com</a><br><a href="mailto:info@cumberlandmountainmusic.com" style="color:#cbd5e1;">info@cumberlandmountainmusic.com</a>${unsubscribeUrl ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#fbbf24;text-decoration:underline;">Unsubscribe from CMMS updates</a>` : ""}</td></tr></table></td></tr></table></body></html>`;
  const text = [heading, message, showCta ? `${ctaLabel}: ${ctaUrl}` : "", "Cumberland Mountain Music Show", "www.cumberlandmountainmusic.com", "info@cumberlandmountainmusic.com", unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ""].filter(Boolean).join("\n\n");
  return { html, text };
}

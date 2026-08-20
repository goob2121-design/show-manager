import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node native type stripping requires the explicit TypeScript extension.
import { EMAIL_CENTER_LOGO_URL, renderEmailCenterEmail } from "./email-center-renderer.ts";

test("legacy plain text is wrapped in the CMMS branded shell with a plain-text fallback", () => {
  const result = renderEmailCenterEmail({ message: "Hello from CMMS.\n\nWe hope to see you soon." });
  assert.match(result.html, /#071426/);
  assert.match(result.html, new RegExp(EMAIL_CENTER_LOGO_URL.replace(/[.]/g, "\\.")));
  assert.match(result.html, /Big-Time Show &bull; Small-Town Hospitality/);
  assert.match(result.html, /www\.cumberlandmountainmusic\.com/);
  assert.match(result.text, /Hello from CMMS/);
  assert.doesNotMatch(result.html, /undefined|null/);
});

test("heading and optional HTTPS CTA render safely", () => {
  const result = renderEmailCenterEmail({ heading: "Hello <Pat>", message: "Visit https://example.com/show for details.", ctaLabel: "Get <Tickets>", ctaUrl: "https://example.com/buy?a=1&b=2" });
  assert.match(result.html, /Hello &lt;Pat&gt;/);
  assert.match(result.html, /Get &lt;Tickets&gt;/);
  assert.match(result.html, /href="https:\/\/example\.com\/buy\?a=1&amp;b=2"/);
  assert.match(result.html, /href="https:\/\/example\.com\/show"/);
  assert.match(result.text, /Get <Tickets>: https:\/\/example\.com\/buy/);
});

test("missing or unsafe CTA does not leave an empty button", () => {
  for (const input of [
    { message: "No action needed", ctaLabel: "", ctaUrl: "" },
    { message: "No action needed", ctaLabel: "Click", ctaUrl: "javascript:alert(1)" },
  ]) {
    const result = renderEmailCenterEmail(input);
    assert.doesNotMatch(result.html, /javascript:|<a href=""/);
    assert.doesNotMatch(result.text, /Click:/);
  }
});

test("promo callout renders offer and escaped code without affecting ordinary messages", () => {
  const promo = renderEmailCenterEmail({ message: "Limited-time ticket savings.", promoOffer: "Save $5 <today>", promoCode: "SAVE<5>", ctaLabel: "Get Tickets", ctaUrl: "https://example.com/tickets" });
  assert.match(promo.html, /SPECIAL OFFER/);
  assert.match(promo.html, /Save \$5 &lt;today&gt;/);
  assert.match(promo.html, /SAVE&lt;5&gt;/);
  assert.match(promo.html, /Use this code at checkout/);
  assert.match(promo.html, /href="https:\/\/example\.com\/tickets"/);
  const ordinary = renderEmailCenterEmail({ message: "Ordinary update" });
  assert.doesNotMatch(ordinary.html, /SPECIAL OFFER|Use this code at checkout/);
});

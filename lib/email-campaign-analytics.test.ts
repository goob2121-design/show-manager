import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignDelivery } from "./email-campaign-analytics";

const helperPromise = import(new URL("./email-campaign-analytics.ts", import.meta.url).href) as Promise<typeof import("./email-campaign-analytics")>;

test("classifies common email domains case-insensitively", async () => {
  const { classifyEmailProvider } = await helperPromise;
  const cases = [
    ["person@GMAIL.COM", "Gmail"], ["person@googlemail.com", "Gmail"],
    ["person@yahoo.com", "Yahoo"], ["person@yahoo.co.uk", "Yahoo"], ["person@ymail.com", "Yahoo"],
    ["person@outlook.com", "Microsoft"], ["person@hotmail.com", "Microsoft"],
    ["person@live.com", "Microsoft"], ["person@msn.com", "Microsoft"],
    ["person@icloud.com", "Apple"], ["person@me.com", "Apple"], ["person@mac.com", "Apple"],
    ["person@aol.com", "AOL"], ["person@customdomain.com", "Other"],
  ] as const;
  cases.forEach(([email, provider]) => assert.equal(classifyEmailProvider(email).provider, provider));
});

test("campaign metrics count unique linked delivery rows rather than duplicate events", async () => {
  const { buildCampaignAnalytics, formatCampaignRate } = await helperPromise;
  const deliveries: CampaignDelivery[] = [
    { id: "gmail-open", recipient_name: "G", recipient_email: "g@gmail.com", current_status: "opened", events: [{ event_type: "email.delivered" }, { event_type: "email.opened" }, { event_type: "email.opened" }] },
    { id: "yahoo-click", recipient_name: "Y", recipient_email: "y@yahoo.com", current_status: "clicked", events: [{ event_type: "email.delivered" }, { event_type: "email.opened" }, { event_type: "email.clicked" }, { event_type: "email.clicked" }] },
    { id: "ms-bounce", recipient_name: "M", recipient_email: "m@outlook.com", current_status: "bounced", events: [{ event_type: "email.bounced" }, { event_type: "email.bounced" }] },
    { id: "apple-failed", recipient_name: "A", recipient_email: "a@icloud.com", current_status: "failed", events: [{ event_type: "email.failed" }] },
    { id: "aol-pending", recipient_name: "O", recipient_email: "o@aol.com", current_status: "sent", events: [{ event_type: "email.sent" }] },
    { id: "other-complaint", recipient_name: "C", recipient_email: "c@custom.org", current_status: "complained", events: [{ event_type: "email.delivered" }, { event_type: "email.complained" }] },
  ];
  const analytics = buildCampaignAnalytics(deliveries);
  assert.equal(analytics.recipients, 6); assert.equal(analytics.accepted, 5);
  assert.equal(analytics.delivered, 3); assert.equal(analytics.opened, 2); assert.equal(analytics.clicked, 1);
  assert.equal(analytics.pending, 1); assert.equal(analytics.bounced, 1); assert.equal(analytics.failed, 1);
  assert.equal(analytics.complained, 1); assert.equal(analytics.problems, 3);
  assert.equal(formatCampaignRate(analytics.deliveryRate), "60%");
  assert.equal(formatCampaignRate(analytics.openRate), "67%");
  assert.equal(formatCampaignRate(analytics.clickRate), "33%");
  assert.equal(analytics.providers.reduce((sum, provider) => sum + provider.recipients, 0), analytics.recipients);
});

test("analytics only include delivery rows supplied for the selected campaign", async () => {
  const { buildCampaignAnalytics } = await helperPromise;
  const analytics = buildCampaignAnalytics([
    { id: "selected", recipient_name: null, recipient_email: "selected@gmail.com", current_status: "delivered", events: [] },
  ]);
  assert.deepEqual(analytics.recipientRows.map((row) => row.id), ["selected"]);
  assert.equal(analytics.providers[0]?.provider, "Gmail");
  assert.equal(analytics.providers[0]?.domains[0]?.domain, "gmail.com");
});

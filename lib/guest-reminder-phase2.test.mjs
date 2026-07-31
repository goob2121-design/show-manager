import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/admin/shows/[showId]/guest-reminder/route.ts", import.meta.url);
const dialogUrl = new URL("../app/components/guest-reminder-preview-dialog.tsx", import.meta.url);
const pageUrl = new URL("../app/components/show-page.tsx", import.meta.url);

test("preview and send use the same authoritative builder without blocking complete profiles", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.ok(route.includes('action === "preview"'));
  assert.ok(route.includes("const content = buildGuestReminderEmail"));
  assert.ok(route.includes("sendGuestReminderEmail(content)"));
  assert.ok(!route.includes("missingItems.length === 0"));
  assert.ok(!route.includes("No reminder email is necessary"));
});

test("dialog previews optional notes and allows complete reminders", async () => {
  const dialog = await readFile(dialogUrl, "utf8");
  assert.ok(dialog.includes("Additional Note (Optional)"));
  assert.ok(dialog.includes("srcDoc={renderedEmail.html}"));
  assert.ok(!dialog.includes("disabled={complete || isSending}"));
  assert.ok(dialog.includes("onClick={onSend} disabled={isSending}"));
  assert.ok(dialog.includes("Everything required has been received"));
});

test("send handler allows complete reminder previews", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.ok(page.includes("if (!show || !guestReminderPreview) return;"));
  assert.ok(!page.includes("guestReminderPreview.missingItems.length === 0"));
});

test("guest cards expose readiness and Last Reminder", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.ok(page.includes('"COMPLETE"'));
  assert.ok(page.includes('"MISSING INFO"'));
  assert.ok(page.includes('"NO EMAIL"'));
  assert.ok(page.includes('Last Reminder: {lastReminderLabel ?? "Never"}'));
});

test("reminder portal URLs use the canonical Guest Portal profile ID", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.ok(route.includes("encodeURIComponent(profile.id)"));
});

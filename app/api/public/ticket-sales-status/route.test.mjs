import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("route.ts", import.meta.url);
const migrationUrl = new URL("../../../../supabase/migrations/20260822_add_ticket_sale_status.sql", import.meta.url);
const showPageUrl = new URL("../../../components/show-page.tsx", import.meta.url);

test("migration preserves existing ticket visibility with a constrained public default", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /set ticket_sale_status = 'public'[\s\S]*where ticket_sale_status is null/);
  assert.match(sql, /alter column ticket_sale_status set default 'public'/);
  assert.match(sql, /alter column ticket_sale_status set not null/);
  assert.match(sql, /check \(ticket_sale_status in \('not_on_sale', 'presale', 'public'\)\)/);
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
});

test("public route uses the established earliest non-archived upcoming show rule", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /\.eq\("is_archived", false\)/);
  assert.match(source, /\.gte\("show_date", today\)/);
  assert.match(source, /\.order\("show_date", \{ ascending: true \}\)/);
  assert.match(source, /\.limit\(1\)/);
  assert.match(source, /\{ show: null, ticketSales: null \}/);
});

test("public route selects and returns only approved status fields", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /select\("slug,name,show_date,ticket_sale_status,presale_starts_at,public_sale_starts_at"\)/);
  assert.match(source, /show: \{ slug: data\.slug, name: data\.name, date: data\.show_date \}/);
  assert.match(source, /status: effectiveTicketSaleStatus\(data\)/);
  for (const forbidden of ["ticket_link", "access_token", "reservation_token", "entry_code", "customer_email", "customer_name", "subscriber"]) {
    assert.equal(source.includes(forbidden), false, `public route must not expose ${forbidden}`);
  }
});

test("admin controls persist settings, validate date order, and display the effective automatic state", async () => {
  const source = await readFile(showPageUrl, "utf8");
  assert.match(source, /name="ticketSaleStatus"/);
  assert.match(source, /value="not_on_sale"/);
  assert.match(source, /value="presale"/);
  assert.match(source, /value="public"/);
  assert.match(source, /name="presaleStartsAt"/);
  assert.match(source, /name="publicSaleStartsAt"/);
  assert.match(source, /ticket_sale_status: normalizeTicketSaleStatus\(showDetailsFormState\.ticketSaleStatus\)/);
  assert.match(source, /presale_starts_at: normalizeOptionalDateTime\(showDetailsFormState\.presaleStartsAt\)/);
  assert.match(source, /public_sale_starts_at: normalizeOptionalDateTime\(showDetailsFormState\.publicSaleStartsAt\)/);
  assert.doesNotMatch(source, /setInterval\([^)]*ticketSale|setTimeout\([^)]*ticketSale/);
  assert.match(source, /validateTicketSaleSchedule/);
  assert.match(source, /Effective: \{ticketSaleStatusLabel\(effectiveTicketSaleState\.status\)\}/);
  assert.match(source, /Automatic schedule enabled/);
  assert.match(source, /Manual override active — ticket sales are disabled\./);
  assert.doesNotMatch(source, /will not automatically change the selected status/);
});

test("ticket sale status work does not touch Square or reserved seating pipelines", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.doesNotMatch(source, /square|checkout|reserved_seat|seat_assignment|ticket_link/i);
});

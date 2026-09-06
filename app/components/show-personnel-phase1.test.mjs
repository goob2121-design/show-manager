import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260907_add_show_personnel_phase1.sql",
);
const panel = read("app/components/show-personnel-panel.tsx");
const showPage = read("app/components/show-page.tsx");
const dashboard = read("app/shows/page.tsx");
const collectionRoute = read("app/api/admin/shows/[showId]/personnel/route.ts");
const itemRoute = read(
  "app/api/admin/shows/[showId]/personnel/[personnelId]/route.ts",
);

test("migration seeds the five band members plus Gerald at zero without adding Gerald to the band", () => {
  for (const name of [
    "Bryan Turner",
    "Stuart Wyrick",
    "Justin Salyer",
    "Sawyer Blankenship",
    "Clint Hurd",
    "Gerald Mullins",
  ]) {
    assert.match(
      migration,
      new RegExp(`\\('${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'`),
    );
  }
  assert.equal((migration.match(/0\.00/g) ?? []).length >= 6, true);
  assert.match(migration, /band\.profile_key = 'cmms_house_band'/);
  assert.doesNotMatch(migration, /member_name[^;]*Gerald Mullins/s);
});

test("migration preserves general history and adds durable duplicate guards", () => {
  assert.match(migration, /entry_kind text not null default 'general'/);
  assert.match(
    migration,
    /where entry_kind = 'personnel' and personnel_profile_id is not null/,
  );
  assert.match(
    migration,
    /where entry_kind = 'personnel' and guest_profile_id is not null/,
  );
  assert.doesNotMatch(migration, /delete from|drop table|truncate/i);
});

test("new personnel routes are admin authenticated and show scoped", () => {
  for (const source of [collectionRoute, itemRoute]) {
    assert.match(source, /verifyAdminSessionCookieValue/);
    assert.match(source, /\.eq\("show_id", showId\)/);
  }
  assert.match(
    collectionRoute,
    /\.eq\("show_id", showId\).*\.maybeSingle\(\)/s,
  );
  assert.doesNotMatch(collectionRoute, /agreed_fee/);
  assert.match(
    itemRoute,
    /paid_at: paid \? \(existing\.paid_at \?\? now\) : null/,
  );
});

test("Finance exposes Personnel Pay, aggregates every report scope, and leaves Other Payouts general", () => {
  assert.match(showPage, /label: "Personnel Pay"/);
  assert.match(showPage, /label: "Other Payouts"/);
  assert.match(showPage, /aggregateFinanceItems\(financeItems, payoutItems\)/);
  assert.match(showPage, /financeItems: aggregatedFinanceItems/);
  assert.match(showPage, /yearlyPersonnelData/);
  assert.match(showPage, /payoutItems: generalPayoutItems/);
  assert.match(dashboard, /aggregateFinanceItems/);
});

test("Personnel Pay UI provides all add modes, settlement controls, warning, and zero-write print", () => {
  for (const label of [
    "Add Regular CMMS Personnel",
    "Add Show Guest",
    "Add Custom Person",
    "Mark Paid",
    "Mark Unpaid",
    "Print Personnel Pay Sheet",
  ]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /Existing manual performer-pay expenses may overlap/);
  const printBody = panel.slice(
    panel.indexOf("function print()"),
    panel.indexOf("return ("),
  );
  assert.doesNotMatch(printBody, /fetch\(|supabase|insert|update|delete/i);
  for (const heading of [
    "Person",
    "Role",
    "Amount",
    "Paid",
    "Payment Method",
    "Signature",
  ])
    assert.match(printBody, new RegExp(heading));
});

import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdmissionsSyncPreview,
  loadAdmissionsSyncPreview,
  type AdmissionsPreviewData,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./admissions-sync-preview.ts";

const generatedAt = "2026-07-25T12:00:00.000Z";

function baseData(overrides: Partial<AdmissionsPreviewData> = {}): AdmissionsPreviewData {
  return {
    showId: "show_1",
    tickets: [],
    reservedLinks: [],
    reservedAssignments: [],
    sponsors: [],
    ...overrides,
  };
}

test("first-time and Pamela-style paid reserved links would add without ownership mutation", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    reservedLinks: [{
      id: "pamela_link",
      customer_name: "Pamela Blevins",
      ticket_count: 2,
      source_ticket_id: null,
      selection_mode: "customer",
      is_complimentary: false,
      source_note: "Square",
      seat_category: "paid_reserved",
    }],
    reservedAssignments: [
      { id: "seat_1", seating_link_id: "pamela_link", assignment_type: "customer", seat_category: "paid_reserved", notes: null },
      { id: "seat_2", seating_link_id: "pamela_link", assignment_type: "customer", seat_category: "paid_reserved", notes: null },
    ],
  }), generatedAt);

  assert.equal(preview.counts.wouldAdd, 1);
  assert.equal(preview.details[0]?.classification, "paid_reserved_link_missing_projection");
  assert.equal(preview.details[0]?.displayLabel, "Pamela Blevins");
  assert.equal(preview.details[0]?.quantity, 2);
  assert.equal(preview.details[0]?.destinationGroup, "prepaid_online");
  assert.match(preview.details[0]?.maskedSourceIdentity ?? "", /^reserved_link:/);
  assert.equal(preview.details.some((item) => item.sourceType === "reserved_assignment"), false);
});

test("link with an existing source ticket and Square ticket are already present", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    tickets: [{ id: "ticket_1", guest_name: "Square Customer", ticket_count: 1, ticket_type: "paid_online", notes: null, external_source: "square" }],
    reservedLinks: [{
      id: "link_1",
      customer_name: "Linked Buyer",
      ticket_count: 1,
      source_ticket_id: "ticket_1",
      selection_mode: "imported",
      is_complimentary: false,
      source_note: null,
      seat_category: "paid_reserved",
    }],
  }), generatedAt);

  assert.equal(preview.counts.alreadyPresent, 2);
  assert.equal(preview.details.every((item) => item.status === "already_present"), true);
  assert.match(preview.details[0]?.reason ?? "", /Square-imported/);
});

test("reserved comp categories classify from stable link sources", () => {
  const categories = ["band", "guest", "media", "volunteer", "staff", "other"] as const;
  const preview = buildAdmissionsSyncPreview(baseData({
    reservedLinks: categories.map((category) => ({
      id: `${category}_link`,
      customer_name: `${category} Person`,
      ticket_count: 1,
      source_ticket_id: null,
      selection_mode: "comp",
      is_complimentary: true,
      source_note: `[Comp Type: ${category}]`,
      seat_category: "comp",
    })),
  }), generatedAt);

  assert.deepEqual(
    preview.details.map((item) => item.classification),
    ["band_comp", "guest_comp", "media_comp", "volunteer_comp", "staff_comp", "other_comp"],
  );
  assert.equal(preview.counts.wouldAdd, 6);
  assert.equal(preview.details.every((item) => item.destinationGroup === "special_admissions"), true);
  assert.equal(preview.details[0]?.displayLabel, "Band Comp - band Person");
  assert.equal(preview.details[1]?.displayLabel, "Guest Comp - guest Person");
});

test("sponsor allowance is already present via native sponsor check-in", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    sponsors: [{ id: "sponsor_1", comp_ticket_allowance: 4, sponsor: { name: "Cumberland Mountain Music Show Sponsor" } }],
  }), generatedAt);

  assert.equal(preview.counts.alreadyPresent, 1);
  assert.equal(preview.details[0]?.classification, "sponsor_admission_native_check_in");
  assert.equal(preview.details[0]?.displayLabel, "Cumberland Mountain Music Show Sponsor");
  assert.equal(preview.details[0]?.destinationGroup, "sponsor_native");
});

test("existing paid and comp tickets route conservatively while ambiguous manual entries need review", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    tickets: [
      { id: "paid_ticket", guest_name: "Paid Buyer", ticket_count: 2, ticket_type: "paid_online", notes: null, external_source: null },
      { id: "comp_ticket", guest_name: "Guest Comp", ticket_count: 1, ticket_type: "complimentary", notes: "[Comp Type: guest]", external_source: null },
      { id: "manual_unknown", guest_name: "Manual Entry", ticket_count: 1, ticket_type: "manual", notes: null, external_source: null },
      { id: "door_sale", guest_name: "Paid Door Sale", ticket_count: 1, ticket_type: "door_paid", notes: null, external_source: null },
    ],
  }), generatedAt);

  assert.deepEqual(preview.details.map((item) => item.destinationGroup), [
    "prepaid_online",
    "special_admissions",
    "needs_review",
    "door_sale_native",
  ]);
});
test("ambiguous ownership is skipped", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    reservedLinks: [{
      id: "link_missing_ticket",
      customer_name: null,
      ticket_count: 1,
      source_ticket_id: "missing_ticket",
      selection_mode: "customer",
      is_complimentary: false,
      source_note: null,
      seat_category: "paid_reserved",
    }],
  }), generatedAt);

  assert.equal(preview.counts.skipped, 1);
  assert.equal(preview.details[0]?.classification, "ambiguous_source_ownership");
});

test("repeated preview produces identical output", () => {
  const data = baseData({
    reservedLinks: [{
      id: "link_1",
      customer_name: null,
      ticket_count: 1,
      source_ticket_id: null,
      selection_mode: "customer",
      is_complimentary: false,
      source_note: null,
      seat_category: "paid_reserved",
    }],
  });
  assert.deepEqual(
    buildAdmissionsSyncPreview(data, generatedAt),
    buildAdmissionsSyncPreview(data, generatedAt),
  );
});

test("missing names use source-specific fallbacks", () => {
  const preview = buildAdmissionsSyncPreview(baseData({
    tickets: [{ id: "ticket_fallback", guest_name: null, ticket_count: 1, ticket_type: "manual", notes: null, external_source: null }],
    reservedLinks: [{ id: "link_fallback", customer_name: null, ticket_count: 1, source_ticket_id: null, selection_mode: "customer", is_complimentary: false, source_note: null, seat_category: "paid_reserved" }],
    reservedAssignments: [{ id: "assignment_fallback", seating_link_id: null, assignment_type: "customer", seat_category: "comp", notes: null }],
    sponsors: [{ id: "sponsor_fallback", comp_ticket_allowance: 1, sponsor: null }],
  }), generatedAt);

  assert.deepEqual(preview.details.map((item) => item.displayLabel), [
    "Unnamed Ticket Entry",
    "Unnamed Reserved Admission",
    "Unnamed Reserved Assignment",
    "Unnamed Sponsor",
  ]);
});

test("stable masked identity remains ID-based when names are identical", () => {
  const shared = { customer_name: "Same Person", ticket_count: 1, source_ticket_id: null, selection_mode: "customer", is_complimentary: false, source_note: null, seat_category: "paid_reserved" };
  const preview = buildAdmissionsSyncPreview(baseData({
    reservedLinks: [{ id: "link_alpha", ...shared }, { id: "link_bravo", ...shared }],
  }), generatedAt);

  assert.equal(preview.details[0]?.displayLabel, preview.details[1]?.displayLabel);
  assert.notEqual(preview.details[0]?.maskedSourceIdentity, preview.details[1]?.maskedSourceIdentity);
});

test("sidecar identity changes a reserved source from ready to add to already present", () => {
  const link = { id: "link_projected", customer_name: "Pamela Blevins", ticket_count: 2, source_ticket_id: null, selection_mode: "customer", is_complimentary: false, source_note: null, seat_category: "paid_reserved" };
  const before = buildAdmissionsSyncPreview(baseData({ reservedLinks: [link] }), generatedAt);
  const after = buildAdmissionsSyncPreview(baseData({
    reservedLinks: [link],
    projectionSources: [{ source_type: "reserved_link", source_id: link.id, projected_ticket_id: "ticket_projection" }],
  }), generatedAt);

  assert.equal(before.details[0]?.status, "would_add");
  assert.equal(after.details[0]?.status, "already_present");
  assert.equal(after.details[0]?.displayLabel, "Pamela Blevins");
});
test("loader performs only six SELECT query chains and calls no mutation method", async () => {
  const calls: string[] = [];
  const rows: Record<string, unknown[]> = {
    shows: [{ id: "show_1" }],
    show_comp_tickets: [],
    show_reserved_seating_links: [],
    show_reserved_seat_assignments: [],
    show_sponsors: [],
    show_admission_projection_sources: [],
  };

  function query(table: string) {
    const result = { data: rows[table] ?? [], error: null };
    const builder = {
      select() { calls.push(`${table}.select`); return builder; },
      eq() { calls.push(`${table}.eq`); return builder; },
      order() { calls.push(`${table}.order`); return builder; },
      async maybeSingle() {
        calls.push(`${table}.maybeSingle`);
        return { data: rows[table]?.[0] ?? null, error: null };
      },
      insert() { throw new Error("insert must never be called"); },
      update() { throw new Error("update must never be called"); },
      upsert() { throw new Error("upsert must never be called"); },
      delete() { throw new Error("delete must never be called"); },
      then(resolve: (value: typeof result) => unknown) { return Promise.resolve(result).then(resolve); },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      return query(table);
    },
  } as unknown as SupabaseClient;

  const preview = await loadAdmissionsSyncPreview(client, "show_1", "show-slug", generatedAt);
  assert.equal(preview.counts.wouldAdd, 0);
  assert.equal(calls.filter((call) => call.endsWith(".select")).length, 6);
  assert.deepEqual(
    calls.filter((call) => call.startsWith("from:")),
    [
      "from:shows",
      "from:show_comp_tickets",
      "from:show_reserved_seating_links",
      "from:show_reserved_seat_assignments",
      "from:show_sponsors",
      "from:show_admission_projection_sources",
    ],
  );
});

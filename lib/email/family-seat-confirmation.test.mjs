import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
function load(file, stubs = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, root), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(code, { exports, require: (name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts", stubs);
    return require(name);
  }, console, URL, process: { env: {} }, ...globals });
  return exports;
}
const seatRows = [
  { id: "assignment-1", seat_id: "L-A1", occupant_type: "ticketed" },
  { id: "assignment-2", seat_id: "L-A2", occupant_type: "ticketed" },
  { id: "assignment-3", seat_id: "L-A3", occupant_type: "child_free" },
  { id: "assignment-4", seat_id: "L-A4", occupant_type: "child_free" },
  { id: "assignment-5", seat_id: "L-A5", occupant_type: "child_free" },
];
const emailStubs = {
  "resend": { Resend: class {} },
  "@/lib/email/reserved-seat-email": {
    buildTicketCodeSection: (input) => ({ html: `<code>${input.scanToken}</code>`, text: `CODE: ${input.scanToken}` }),
    RESERVED_SEAT_EMAIL_EVENT_NAME: "CMMS",
  },
  "@/lib/email/cmms-email-logo": { CMMS_EMAIL_LOGO_SRC: null },
  "@/lib/email/ticket-code-attachments": { getTicketCodeEmailImageSources: () => ({}) },
  "@/lib/server/stageflow-public-url": { buildReservedSeatSelectionUrl: (token) => `https://example.com/reserved-seating/${token}` },
  "@/lib/email/resolve-reserved-seat-recipient": {},
  "@/lib/reserved-seat-pay-at-door-ticket": { loadReservedSeatPayAtDoorTicket: async () => null },
};

test("updated email uses all five seats, distinguishes children, and preserves the code and paid quantity", async () => {
  const email = load("lib/email/official-ticket-email.ts", emailStubs);
  const link = { id: "reservation", show_id: "show", customer_name: "Family", email: "test@example.com",
    ticket_count: 2, selection_token: "private-link", scan_token: "existing-code", submitted_at: "now", is_complimentary: false };
  const supabase = { from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      maybeSingle: async () => ({ data: table === "shows" ? { name: "Show" } : link, error: null }),
      order: async () => ({ data: seatRows, error: null }),
      update() { return { eq: async () => ({ error: null }) }; },
    }; return query;
  } };
  const sent = [];
  const sender = async (input) => { sent.push(input); return { success: true }; };
  await email.deliverOfficialTicketEmail(supabase, link.id, { updatedConfirmation: true, sender });
  await email.deliverOfficialTicketEmail(supabase, link.id, { updatedConfirmation: true, sender });
  assert.equal(sent[0].scanToken, "existing-code");
  assert.equal(sent[0].ticketCount, 2);
  assert.equal(sent[0].paidSeatLabels.length, 2);
  assert.equal(sent[0].childSeatLabels.length, 3);
  assert.equal(sent[0].seatLabels.length, 5);
  assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey);
  const content = email.buildOfficialTicketEmail(sent[0]);
  assert.match(content.subject, /^Updated Seating Confirmation/);
  assert.match(content.text, /Paid Seats: 2/);
  assert.match(content.text, /Free Child Seats: 3/);
  assert.match(content.text, /Total Occupied Seats: 5/);
  assert.match(content.html, /existing-code/);
  const compContent = email.buildOfficialTicketEmail({ ...sent[0], isComplimentary: true });
  assert.match(compContent.text, /Complimentary Seats: 2/);
});

function savedEmailFixture() {
  const email = load("lib/email/official-ticket-email.ts", emailStubs);
  let assignments = seatRows;
  const link = { id: "reservation", show_id: "show", customer_name: "Family", email: "test@example.com",
    ticket_count: 2, selection_token: "private-link", scan_token: "existing-code", submitted_at: "now", is_complimentary: false };
  const supabase = { from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      maybeSingle: async () => ({ data: table === "shows" ? { name: "Show" } : link, error: null }),
      order: async () => ({ data: assignments, error: null }),
      update() { return { eq: async () => ({ error: null }) }; },
    }; return query;
  } };
  return { email, supabase, setAssignments(rows) { assignments = rows; } };
}

test("A to B to A creates three email versions while retries of the final change reuse its key", async () => {
  const fixture = savedEmailFixture();
  const sent = [];
  const sender = async (input) => { sent.push(input); return { success: true }; };
  for (const version of [1, 2, 3]) {
    fixture.setAssignments(seatRows.map((seat, index) => ({
      ...seat, id: `version-${version}-${index}`,
      seat_id: version === 2 && index === 4 ? "L-A6" : seat.seat_id,
    })));
    await fixture.email.deliverOfficialTicketEmail(fixture.supabase, "reservation", { updatedConfirmation: true, sender });
  }
  await fixture.email.deliverOfficialTicketEmail(fixture.supabase, "reservation", { updatedConfirmation: true, sender });
  assert.equal(new Set(sent.slice(0, 3).map((input) => input.idempotencyKey)).size, 3);
  assert.equal(sent[2].idempotencyKey, sent[3].idempotencyKey);
  assert.equal(JSON.stringify(sent[0].seatLabels), JSON.stringify(sent[2].seatLabels));
  assert.ok(sent.every((input) => input.scanToken === "existing-code" && input.ticketCount === 2));
});

test("Email Ticket Again retries a failed family confirmation with the saved change key", async () => {
  const fixture = savedEmailFixture();
  const attempts = [];
  const sender = async (input) => { attempts.push(input); return { success: attempts.length > 1 }; };
  const first = await fixture.email.deliverOfficialTicketEmail(fixture.supabase, "reservation", { updatedConfirmation: true, sender });
  assert.equal(first.success, false);
  const route = load("app/api/reserved-seating/ticket-email/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@supabase/supabase-js": { createClient: () => fixture.supabase },
    "@/lib/email/official-ticket-email": { deliverOfficialTicketEmail: (client, id, options) => fixture.email.deliverOfficialTicketEmail(client, id, { ...options, sender }) },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.com", SUPABASE_SERVICE_ROLE_KEY: "test-only" } } });
  const result = await route.POST({ nextUrl: { origin: "https://example.com" }, json: async () => ({ token: "private-link", updatedConfirmation: true }) });
  assert.equal(result.body.success, true);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].idempotencyKey, attempts[1].idempotencyKey);
  assert.equal(attempts[1].updatedConfirmation, true);
});

function familyRoute(previous, delivery, rpcStatus = "UPDATED") {
  let emails = 0, saves = 0;
  const client = {
    from(table) { const query = {
      select() { return query; },
      eq() { return table === "show_reserved_seat_assignments" ? Promise.resolve({ data: previous, error: null }) : query; },
      maybeSingle: async () => ({ data: { id: "reservation" }, error: null }),
    }; return query; },
    rpc: async () => { saves++; return { data: [{ result_status: rpcStatus, reservation_id: "reservation", child_seat_limit: 3 }], error: null }; },
  };
  const route = load("app/api/reserved-seating/family-seats/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@supabase/supabase-js": { createClient: () => client },
    "@/lib/reserved-child-seats": { isReservedChildSeatsEnabled: () => true, getReservedFamilySeatUpdateError: (status) => status === "UPDATED" ? null : "Conflict" },
    "@/lib/email/official-ticket-email": { deliverOfficialTicketEmail: async (...args) => { emails++; return delivery(...args); } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.com", SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, console: { error() {} } });
  return { route, counts: () => ({ emails, saves }) };
}
const request = () => ({ url: "https://example.com/api/reserved-seating/family-seats", json: async () => ({
  token: "private-link", paidSeatIds: ["L-A1", "L-A2"], childSeatIds: ["L-A3", "L-A4", "L-A5"],
}) });

test("duplicate unchanged submissions preserve saved assignment IDs and send no email", async () => {
  const fixture = familyRoute(seatRows, async () => { throw Error("Must not send"); });
  const result = await fixture.route.POST(request());
  assert.equal(result.body.success, true);
  assert.equal(result.body.result.resultStatus, "UNCHANGED");
  await fixture.route.POST(request());
  assert.deepEqual(fixture.counts(), { emails: 0, saves: 0 });
});

test("changed family seating sends an updated confirmation only after saving", async () => {
  const fixture = familyRoute(seatRows.slice(0, 2), async (_client, id, options) => {
    assert.equal(fixture.counts().saves, 1);
    assert.equal(id, "reservation");
    assert.equal(options.updatedConfirmation, true);
    return { success: true };
  });
  const result = await fixture.route.POST(request());
  assert.equal(result.body.ticketEmailDelivered, true);
  assert.deepEqual(fixture.counts(), { emails: 1, saves: 1 });
});

test("failed or thrown delivery never turns saved seats into a failed reservation", async () => {
  for (const delivery of [async () => ({ success: false }), async () => { throw Error("Mail unavailable"); }]) {
    const fixture = familyRoute(seatRows.slice(0, 2), delivery);
    const result = await fixture.route.POST(request());
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.ticketEmailDelivered, false);
    assert.match(result.body.ticketEmailMessage, /seats are saved/);
    assert.deepEqual(fixture.counts(), { emails: 1, saves: 1 });
  }
});

test("a rejected seat update never sends an email", async () => {
  const fixture = familyRoute(seatRows.slice(0, 2), async () => ({ success: true }), "SEAT_CONFLICT");
  const result = await fixture.route.POST(request());
  assert.equal(result.status, 409);
  assert.equal(fixture.counts().emails, 0);
});

test("customer confirmation initializes paid seats and offers both child and skip actions", () => {
  const page = readFileSync(new URL("app/components/reserved-seat-selection-page.tsx", root), "utf8");
  const initialSave = page.slice(page.indexOf("const normalizedSeatIds ="), page.indexOf("async function resendOfficialTicketEmail"));
  assert.match(initialSave, /setConfirmedPaidSeatIds\(normalizedSeatIds\)/);
  assert.match(initialSave, /setFamilyPaidSeatIds\(normalizedSeatIds\)/);
  const dialog = page.slice(page.indexOf("{showSuccessModal ?"));
  assert.match(dialog, /canManageChildSeats[\s\S]*Add Free Child Seats/);
  assert.match(dialog, /setShowSuccessModal\(false\); beginFamilySeatChanges\(\)/);
  assert.match(dialog, /Continue Without Children/);
  const admin = readFileSync(new URL("app/components/reserved-seating-panel.tsx", root), "utf8");
  assert.equal(admin.split("{link.childSeatIds.length} children / {link.seatIds.length} occupied").length - 1, 2);
});

test("customer can add a child immediately after confirming two paid seats without reloading", async () => {
  const state = [];
  let cursor = 0;
  const requests = [];
  const jsx = (type, props) => ({ type, props });
  const component = load("app/components/reserved-seat-selection-page.tsx", {
    "react": {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [state[i], (next) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
      },
      useMemo: (fn) => fn(), useEffect() {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/app/components/phone-ticket-mode": { PhoneTicketMode: "phone-ticket" },
    "@/app/components/reservation-ticket-code": { ReservationTicketCode: "entry-code" },
    "@/app/components/reserved-seat-map": { ReservedSeatMap: "seat-map" },
  }, {
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => url.endsWith("/submit")
        ? { success: true, data: { seatIds: ["L-A1", "L-A2"], ticketEmailDelivered: true } }
        : { success: true, ticketEmailDelivered: true } };
    },
  }).ReservedSeatSelectionPage;
  const props = { show: { name: "Show", show_date: "2026-10-15" }, seatingLink: {
    id: "reservation", customer_name: "Family", selection_token: "private-link", scan_token: "existing-code",
    ticket_count: 2, child_seat_limit: 3, seat_category: "paid_reserved", is_complimentary: false,
  }, assignments: [], childSeatsEnabled: true, payAtDoorTicket: null };
  const render = () => { cursor = 0; return component(props); };
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    if (node && typeof node === "object") return text(node.props?.children);
    return node == null || typeof node === "boolean" ? "" : String(node);
  }
  const button = (tree, label) => {
    const found = nodes(tree).find((node) => node.type === "button" && text(node) === label);
    assert.ok(found, `Missing button: ${label}`); return found;
  };
  let tree = render();
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A1");
  tree = render();
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A2");
  tree = render();
  button(tree, "Review And Confirm Seats").props.onClick();
  tree = render();
  button(tree, "Yes, Reserve These Seats").props.onClick();
  await new Promise(setImmediate);
  tree = render();
  button(tree, "Continue Without Children");
  button(tree, "Add Free Child Seats").props.onClick();
  tree = render();
  assert.match(text(tree), /Paid Seats \(2\/2\)/);
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A3");
  tree = render();
  button(tree, "Save Family Seats").props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(requests[1].body, { token: "private-link", paidSeatIds: ["L-A1", "L-A2"], childSeatIds: ["L-A3"] });
});

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
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts", stubs, globals);
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

function familyRoute(previous, delivery, rpcStatus = "UPDATED", adminAuthorized = true) {
  let emails = 0, saves = 0;
  const client = {
    from(table) { const query = {
      select() { return query; },
      eq() { return table === "show_reserved_seat_assignments" ? Promise.resolve({ data: previous, error: null }) : query; },
      maybeSingle: async () => ({ data: table === "shows" ? { slug: "current-show" } : { id: "reservation", show_id: "show" }, error: null }),
    }; return query; },
    rpc: async () => { saves++; return { data: [{ result_status: rpcStatus, reservation_id: "reservation", child_seat_limit: 3 }], error: null }; },
  };
  const route = load("app/api/reserved-seating/family-seats/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "admin-cookie" }) }) },
    "@/lib/admin-session": { getAdminSessionCookieName: (slug) => `admin-${slug}`, verifyAdminSessionCookieValue: (slug, cookie) => adminAuthorized && slug === "current-show" && cookie === "admin-cookie" },
    "@supabase/supabase-js": { createClient: () => client },
    "@/lib/reserved-child-seats": { isReservedChildSeatsEnabled: () => true, getReservedFamilySeatUpdateError: (status) => status === "UPDATED" ? null : "Conflict" },
    "@/lib/email/official-ticket-email": { deliverOfficialTicketEmail: async (...args) => { emails++; return delivery(...args); } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.com", SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, console: { error() {} } });
  return { route, counts: () => ({ emails, saves }) };
}
const request = () => ({ url: "https://example.com/api/reserved-seating/family-seats", json: async () => ({
  token: "private-link", paidSeatIds: ["L-A1", "L-A2"], childSeatIds: ["L-A3", "L-A4", "L-A5"],
}) });

test("admin family edits require the reservation show's admin session before saving", async () => {
  for (const authorized of [false, true]) {
    const fixture = familyRoute(seatRows.slice(0, 2), async () => ({ success: true }), "UPDATED", authorized);
    const input = request();
    const body = await input.json();
    input.json = async () => ({ ...body, adminFamilyEditing: true });
    const result = await fixture.route.POST(input);
    assert.equal(result.status, authorized ? 200 : 401);
    assert.deepEqual(fixture.counts(), authorized ? { emails: 1, saves: 1 } : { emails: 0, saves: 0 });
  }
});

test("admin family page rejects an unverified cookie and ordinary customer links never enable the editor", async () => {
  for (const [requested, authorized] of [[true, false], [true, true], [false, true]]) {
    const link = { id: "reservation", show_id: "show", submitted_at: "confirmed", source_ticket_id: "ticket", seat_category: "paid_reserved" };
    const client = { from(table) {
      const query = { select() { return query; }, eq() { return query; },
        order: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: table === "shows" ? { slug: "current-show" }
          : table === "show_comp_tickets" ? { ticket_type: "paid_online" } : link }),
      }; return query;
    } };
    const page = load("app/reserved-seating/[token]/page.tsx", {
      "next/navigation": { notFound() { throw Error("NOT_FOUND"); } },
      "next/headers": { cookies: async () => ({ get: () => ({ value: "cookie" }) }) },
      "@/lib/admin-session": { getAdminSessionCookieName: (slug) => `admin-${slug}`,
        verifyAdminSessionCookieValue: (slug, cookie) => authorized && slug === "current-show" && cookie === "cookie" },
      "@/lib/supabase/service": { createServiceSupabaseClient: () => client },
      "@/lib/reserved-seat-pay-at-door-ticket": { loadReservedSeatPayAtDoorTicket: async () => null },
      "@/lib/reserved-child-seats": { isReservedChildSeatsEnabled: () => true },
      "@/app/components/reserved-seat-selection-page": { ReservedSeatSelectionPage: "seating-page" },
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    }).default;
    const result = page({ params: Promise.resolve({ token: "private" }), searchParams: Promise.resolve(requested ? { adminFamily: "1" } : {}) });
    if (requested && !authorized) await assert.rejects(result, /NOT_FOUND/);
    else assert.equal((await result).props.adminFamilyEditing, requested && authorized);
  }
});

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

test("customer confirmation preserves family counts and keeps secondary ticket options collapsed", () => {
  const page = readFileSync(new URL("app/components/reserved-seat-selection-page.tsx", root), "utf8");
  const initialSave = page.slice(page.indexOf("const normalizedSeatIds ="), page.indexOf("async function resendOfficialTicketEmail"));
  assert.match(initialSave, /setConfirmedPaidSeatIds\(paidIds\)/);
  assert.match(initialSave, /setConfirmedChildSeatIds\(childIds\)/);
  const dialog = page.slice(page.indexOf("{showSuccessModal ?"));
  assert.doesNotMatch(dialog, /Add Free Child Seats|Continue Without Children/);
  assert.match(dialog, /<details[\s\S]*More Ticket Options[\s\S]*Email Ticket Again[\s\S]*View Standard Ticket/);
  assert.match(dialog, /Need to make changes to your reservation/);
  const admin = readFileSync(new URL("app/components/reserved-seating-panel.tsx", root), "utf8");
  assert.equal(admin.split("{link.childSeatIds.length} children / {link.seatIds.length} occupied").length - 1, 2);
});

for (const adminEditing of [false, true]) test(adminEditing ? "admin family editor moves a child's seat through the guarded update" : "customer selects paid and child seats together and submits once", async () => {
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
        ? { success: true, data: { seatIds: ["L-A1", "L-A2", "L-A3"], ticketEmailDelivered: true } }
        : { success: true, ticketEmailDelivered: true } };
    },
  }).ReservedSeatSelectionPage;
  const props = { show: { name: "Show", show_date: "2026-10-15" }, seatingLink: {
    id: "reservation", customer_name: "Family", selection_token: "private-link", scan_token: "existing-code",
    ticket_count: 2, child_seat_limit: 3, seat_category: "paid_reserved", is_complimentary: false,
  }, assignments: [], childSeatsEnabled: true, familySelectionEligible: true, payAtDoorTicket: null };
  if (adminEditing) {
    props.adminFamilyEditing = true;
    props.seatingLink.submitted_at = "2026-10-15T12:00:00Z";
    props.assignments = seatRows.slice(0, 3).map((seat) => ({ ...seat, seating_link_id: "reservation", assignment_type: "customer" }));
  }
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
  if (adminEditing) {
    nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A3");
    tree = render();
    nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A4");
    tree = render();
    button(tree, "Save Family Seats").props.onClick();
    await new Promise(setImmediate);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/reserved-seating/family-seats");
    assert.deepEqual(requests[0].body, { token: "private-link", paidSeatIds: ["L-A1", "L-A2"], childSeatIds: ["L-A4"], adminFamilyEditing: true });
    return;
  }
  nodes(tree).find((node) => node.type === "select").props.onChange({ target: { value: "1" } });
  tree = render();
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A1");
  tree = render();
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A2");
  tree = render();
  nodes(tree).find((node) => node.type === "seat-map").props.onSeatClick("L-A3");
  tree = render();
  assert.match(text(tree), /Paid seats: 2\/2 - Free child seats: 1\/1 - Total: 3\/3/);
  button(tree, "Review And Confirm Seats").props.onClick();
  tree = render();
  button(tree, "Yes, Reserve These Seats").props.onClick();
  await new Promise(setImmediate);
  tree = render();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, { token: "private-link", seatIds: ["L-A1", "L-A2"], confirmFamily: true, childSeatIds: ["L-A3"], mailingListOptIn: false });
  assert.match(text(tree), /Free Children 10 And Under · 1/);
});

function initialRoute({ status = "CONFIRMED", deliveryFails = false, adminFails = false, flag = "true", rpc = null } = {}) {
  const events = [];
  let rpcArgs;
  const link = { id: "reservation", show_id: "show", ticket_count: 2, customer_name: "Family <test>", email: "family@example.com" };
  const client = {
    from(table) {
      const query = { select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: table === "shows" ? { name: "CMMS" } : link }) };
      return query;
    },
    async rpc(name, args) {
      assert.ok(["confirm_reserved_family_seats", "confirm_reserved_seats"].includes(name)); rpcArgs = args; events.push("commit");
      if (rpc) return rpc(name, args);
      return { data: [{ result_status: status, submitted_at: "2026-10-15T12:00:00Z" }] };
    },
  };
  const route = load("app/api/reserved-seating/submit/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => client },
    "resend": { Resend: class { emails = { send: async (body, options) => {
      events.push({ admin: body, key: options?.idempotencyKey });
      if (adminFails) throw Error("Admin email failed");
      return { data: { id: "admin-email" } };
    } }; } },
    "@/lib/mailing-list-subscription": {},
    "@/lib/email/official-ticket-email": { deliverOfficialTicketEmail: async (_db, id, options) => {
      assert.equal(events[0], "commit"); assert.equal(id, link.id); events.push({ customer: options });
      if (deliveryFails) throw Error("Customer email failed");
      return { success: true };
    } },
  }, { process: { env: { STAGEFLOW_ENABLE_CHILD_RESERVED_SEATS: flag,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.com", SUPABASE_SERVICE_ROLE_KEY: "test-only",
    RESEND_API_KEY: "test-only", NOTIFY_EMAIL: "admin@example.com" } }, console: { error() {} } });
  return { events, args: () => rpcArgs, submit: (children = ["L-A3"], legacy = false) => route.POST({
    nextUrl: { origin: "https://example.com" }, json: async () => ({ token: "private", ...(!legacy ? { confirmFamily: true, childSeatIds: children } : {}),
      seatIds: ["L-A1", "L-A2"] }),
  }) };
}

test("overlapping legacy/new zero-child submissions attempt only one customer/admin email pair", async () => {
  for (const legacyFirst of [false, true]) {
    let confirmed = false;
    const fixture = initialRoute({ rpc: async () => {
      const result_status = confirmed ? "ALREADY_CONFIRMED" : "CONFIRMED";
      confirmed = true;
      await new Promise(setImmediate);
      return { data: [{ result_status, submitted_at: "same-confirmation" }] };
    } });
    const results = await Promise.all([fixture.submit([], legacyFirst), fixture.submit([], !legacyFirst)]);
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(fixture.events.filter((event) => event.customer).length, 1);
    assert.equal(fixture.events.filter((event) => event.admin).length, 1);
  }
});

test("legacy duplicate and conflict responses do not attempt emails", async () => {
  for (const status of ["ALREADY_CONFIRMED", "ALREADY_SUBMITTED", "EXISTING_ASSIGNMENTS"]) {
    const fixture = initialRoute({ status, flag: "false" });
    const result = await fixture.submit([], true);
    assert.equal(result.status, status === "ALREADY_CONFIRMED" ? 200 : 409);
    assert.deepEqual(fixture.events, ["commit"]);
    assert.equal(fixture.args().p_child_seat_ids, undefined);
  }
});

test("combined initial confirmation sends exactly one customer and admin email after commit", async () => {
  const fixture = initialRoute();
  const result = await fixture.submit();
  assert.equal(result.status, 200);
  assert.deepEqual(Array.from(fixture.args().p_child_seat_ids), ["L-A3"]);
  assert.equal(fixture.events.length, 3);
  assert.equal(fixture.events[0], "commit");
  const notification = fixture.events[2];
  assert.match(notification.admin.html, /Paid seats:<\/strong> 2/);
  assert.match(notification.admin.html, /Free child seats:<\/strong> 1/);
  assert.match(notification.admin.html, /Total occupied seats:<\/strong> 3/);
  assert.match(notification.admin.html, /Family &lt;test&gt;/);
  assert.notEqual(notification.key, fixture.events[1].customer.idempotencyKey);
});

test("zero-child combined confirmation sends one complete paid-only confirmation", async () => {
  const fixture = initialRoute();
  const result = await fixture.submit([]);
  assert.equal(result.status, 200);
  assert.deepEqual(Array.from(result.body.data.childSeatIds), []);
  assert.equal(result.body.data.seatIds.length, 2);
  assert.equal(fixture.events.length, 3);
});

test("duplicate initial submissions send no additional emails and rejected saves send none", async () => {
  for (const status of ["ALREADY_CONFIRMED", "SEAT_CONFLICT", "CHILD_LIMIT_EXCEEDED"]) {
    const fixture = initialRoute({ status });
    const result = await fixture.submit();
    assert.equal(result.status, status === "ALREADY_CONFIRMED" ? 200 : 409);
    assert.deepEqual(fixture.events, ["commit"]);
  }
});

test("customer or admin email failure leaves the committed family reservation successful", async () => {
  for (const options of [{ deliveryFails: true }, { adminFails: true }]) {
    const fixture = initialRoute(options);
    const result = await fixture.submit();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(fixture.events.length, 3);
  }
});

test("disabled family feature cannot call the new RPC", async () => {
  const fixture = initialRoute({ flag: "false" });
  assert.equal((await fixture.submit()).status, 403);
  assert.deepEqual(fixture.events, []);
});

test("initial official email uses complete family seats without an updated-confirmation subject", async () => {
  const fixture = savedEmailFixture();
  let sent;
  await fixture.email.deliverOfficialTicketEmail(fixture.supabase, "reservation", {
    idempotencyKey: "family-initial/customer/reservation/confirmed-version",
    sender: async (input) => { sent = input; return { success: true }; },
  });
  assert.equal(sent.idempotencyKey, "family-initial/customer/reservation/confirmed-version");
  assert.equal(sent.scanToken, "existing-code");
  assert.equal(sent.ticketCount, 2);
  const content = fixture.email.buildOfficialTicketEmail(sent);
  assert.match(content.subject, /^Your Official Tickets/);
  assert.match(content.text, /Paid Seats: 2/);
  assert.match(content.text, /Free Child Seats: 3/);
  assert.match(content.text, /Total Occupied Seats: 5/);
});

test("invitation includes a private kids-information link and preserves existing query parameters", () => {
  const email = load("lib/email/reserved-seat-email.ts", {
    "resend": { Resend: class {} },
    "@/lib/email/cmms-email-logo": { CMMS_EMAIL_LOGO_SRC: null },
    "@/lib/email/ticket-code-attachments": { getTicketCodeEmailImageSources: () => ({}) },
    "@/lib/reservation-ticket-code-display": {},
    "@/lib/server/stageflow-public-url": {},
  });
  const content = email.buildReservedSeatEmail({ customerName: "Family", customerEmail: "family@example.com",
    showName: "Show", showDate: "October 15, 2026", venueName: "Cumberland Gap Convention Center",
    venueAddress: "601 Colwyn St, Cumberland Gap, TN 37724", ticketCount: 2,
    seatSelectionUrl: "https://example.com/reserved-seating/private?source=email" });
  assert.match(content.html, /Bringing Kids Under 10\?/);
  assert.match(content.html, /source=email&amp;kids=1/);
  assert.match(content.text, /Children ages 10 and under receive free admission/);
  assert.match(content.text, /source=email&kids=1/);
});

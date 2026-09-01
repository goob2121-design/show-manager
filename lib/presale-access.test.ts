import assert from "node:assert/strict";
import test from "node:test";

const helperPromise = import(new URL("./presale-access.ts", import.meta.url).href) as Promise<typeof import("./presale-access")>;
const activeShow = {
  ticket_sale_status: "presale", presale_starts_at: null, public_sale_starts_at: null,
  presale_access_code: "CMMSOCT3", ticket_link: "https://tickets.example.com/show",
};

test("presale access normalizes admin and submitted values", async () => {
  const { normalizePresaleAccessCode, validatePresaleAccess } = await helperPromise;
  assert.equal(normalizePresaleAccessCode("  CMMSOCT3  "), "CMMSOCT3");
  assert.equal(normalizePresaleAccessCode("   "), "");
  assert.equal(validatePresaleAccess(activeShow, "cmmsOct3"), true);
  assert.equal(validatePresaleAccess(activeShow, "  CMMSOCT3  "), true);
  assert.equal(validatePresaleAccess(activeShow, "wrong"), false);
  assert.equal(validatePresaleAccess(activeShow, ""), false);
  assert.equal(validatePresaleAccess({ ...activeShow, presale_access_code: null }, "CMMSOCT3"), false);
});

test("code cannot grant access outside the shared effective presale state", async () => {
  const { validatePresaleAccess } = await helperPromise;
  assert.equal(validatePresaleAccess({ ...activeShow, ticket_sale_status: "not_on_sale" }, "CMMSOCT3"), false);
  assert.equal(validatePresaleAccess({ ...activeShow, ticket_sale_status: "public" }, "CMMSOCT3"), false);
  const scheduled = { ...activeShow, presale_starts_at: "2026-09-02T00:00:00Z", public_sale_starts_at: "2026-09-09T00:00:00Z" };
  assert.equal(validatePresaleAccess(scheduled, "CMMSOCT3", new Date("2026-09-01T12:00:00Z")), false);
  assert.equal(validatePresaleAccess(scheduled, "CMMSOCT3", new Date("2026-09-05T12:00:00Z")), true);
  assert.equal(validatePresaleAccess(scheduled, "CMMSOCT3", new Date("2026-09-10T12:00:00Z")), false);
});

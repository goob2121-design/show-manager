import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("route.ts", import.meta.url);
const uiUrl = new URL("../../../components/mailing-list-admin.tsx", import.meta.url);
const emailCenterRouteUrl = new URL("../email-center/route.ts", import.meta.url);
const schemaUrl = new URL("../../../../supabase/schema.sql", import.meta.url);
const publicSubscribeUrl = new URL("../../public/mailing-list/subscribe/route.ts", import.meta.url);
const publicUnsubscribeUrl = new URL("../../public/mailing-list/unsubscribe/route.ts", import.meta.url);

test("admin name update is authenticated, trims names, and updates only nullable name columns", async () => {
  const source = await readFile(routeUrl, "utf8");
  const authorization = source.indexOf("if (!(await authorized(slug)))");
  const updateAction = source.indexOf('action === "update_names"');
  const updateEnd = source.indexOf('} else if (["unsubscribe", "reactivate"]', updateAction);
  const updateBlock = source.slice(updateAction, updateEnd);
  assert.ok(authorization >= 0 && authorization < updateAction);
  assert.match(updateBlock, /cleanMailingListName\(raw\.firstName\) \|\| null/);
  assert.match(updateBlock, /cleanMailingListName\(raw\.lastName\) \|\| null/);
  assert.match(updateBlock, /update\(names\)\.eq\("id", id\)/);
  assert.doesNotMatch(updateBlock, /const names = \{[^}]*\b(?:email|status|source|subscribed_at|unsubscribed_at|last_campaign_at|welcome)\b/);
});

test("Mailing List UI edits optional names inline while keeping email read-only", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /onClick=\{\(\) => startEditing\(item\)\}[\s\S]*>Edit<\/button>/);
  assert.match(source, /First Name for \$\{item\.email\}/);
  assert.match(source, /Last Name for \$\{item\.email\}/);
  assert.match(source, /action: "update_names", id: item\.id, firstName: editFirstName, lastName: editLastName/);
  assert.match(source, />Save<\/button>/);
  assert.match(source, />Cancel<\/button>/);
  assert.match(source, /<td className="py-2 pr-3">\{item\.email\}<\/td>/);
  assert.doesNotMatch(source, /action: "update_names"[^\n]*email:/);
});
test("Add Subscriber captures the form before awaiting and resets only after success", async () => {
  const source = await readFile(uiUrl, "utf8");
  const start = source.indexOf("async function add(");
  const end = source.indexOf("function startEditing", start);
  const addHandler = source.slice(start, end);
  const awaitIndex = addHandler.indexOf("await action(");
  assert.ok(awaitIndex > 0);
  assert.ok(addHandler.indexOf("const form = event.currentTarget") < awaitIndex);
  assert.match(addHandler, /new FormData\(form\)/);
  assert.match(addHandler, /action: "add", firstName: data\.get\("firstName"\), lastName: data\.get\("lastName"\), email: data\.get\("email"\), source: "admin"/);
  assert.match(addHandler, /const added = await action/);
  assert.match(addHandler, /if \(added && form\.isConnected\) form\.reset\(\)/);
  assert.equal(addHandler.slice(awaitIndex).includes("event.currentTarget"), false);
});


test("Email Center continues resolving edited first and last names from subscriber lookup", async () => {
  const source = await readFile(emailCenterRouteUrl, "utf8");
  assert.match(source, /from\("mailing_list_subscribers"\)\.select\("id,email,first_name,last_name"\)\.eq\("status", "active"\)/);
  assert.match(source, /first_name: names\.firstName, last_name: names\.lastName/);
});

test("schema already has nullable name columns and public routes cannot invoke admin name updates", async () => {
  const [schema, subscribe, unsubscribe] = await Promise.all([
    readFile(schemaUrl, "utf8"), readFile(publicSubscribeUrl, "utf8"), readFile(publicUnsubscribeUrl, "utf8"),
  ]);
  assert.match(schema, /mailing_list_subscribers[\s\S]*first_name text, last_name text/);
  assert.doesNotMatch(subscribe, /update_names/);
  assert.doesNotMatch(unsubscribe, /update_names/);
});

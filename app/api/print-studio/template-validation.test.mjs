import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const validatorUrl = new URL("./_lib.ts", import.meta.url);
const routeUrl = new URL("./templates/route.ts", import.meta.url);
const { PRINT_STUDIO_FIELD_TYPES } = await import("../../print-studio/components/types.ts");

const currentTemplate = {
  id: "sponsor-comp-template",
  name: "Sponsor Comp Tickets",
  kind: "sponsor_ticket",
  widthInches: 5.5,
  heightInches: 2,
  orientation: "landscape",
  backgroundVisible: true,
  fields: [{
    id: "sponsor-barcode",
    type: "sponsor_comp_redemption_barcode",
    label: "Sponsor Comp Redemption Barcode",
    x: 12,
    y: 60,
    width: 42,
    height: 22,
    rotation: 0,
    zIndex: 1,
    fontSize: 12,
    fontWeight: 700,
    fontStyle: "normal",
    textAlign: "left",
    color: "#000000",
    letterSpacing: 0,
    lineHeight: 1,
  }],
};

test("current Sponsor Comp template payload uses the canonical accepted field type", async () => {
  const validator = await readFile(validatorUrl, "utf8");
  const route = await readFile(routeUrl, "utf8");

  assert.ok(PRINT_STUDIO_FIELD_TYPES.includes(currentTemplate.fields[0].type));
  assert.match(validator, /PRINT_STUDIO_FIELD_TYPES\.includes\(field\.type as never\)/);
  assert.match(route, /validateTemplatePayload\(template, batchDefaults\)/);
  assert.match(route, /requireEditorKey\(request\)/);
});

test("malformed field types remain rejected while editor-key authentication remains separate", async () => {
  const validator = await readFile(validatorUrl, "utf8");
  const route = await readFile(routeUrl, "utf8");

  assert.equal(PRINT_STUDIO_FIELD_TYPES.includes("not_a_print_field"), false);
  assert.match(validator, /return "Field type is not allowed\."/);
  assert.match(route, /return jsonError\(editorError, editorError\.includes\("configured"\) \? 503 : 401\)/);
});

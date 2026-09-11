import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Sponsor Comp barcode is available in the toolbar and remains record-driven", async () => {
  const [sampleData, fieldTypes, renderer, properties, client] = await Promise.all([
    source("app/print-studio/components/sample-data.ts"),
    source("app/print-studio/components/types.ts"),
    source("app/print-studio/components/print-field-renderer.tsx"),
    source("app/print-studio/components/field-properties-panel.tsx"),
    source("app/print-studio/components/print-studio-client.tsx"),
  ]);

  assert.match(fieldTypes, /sponsor_comp_redemption_barcode/);
  assert.match(sampleData, /Sponsor Comp Redemption Barcode/);
  assert.match(sampleData, /"sponsor_comp_redemption_barcode"/);
  assert.match(renderer, /getSponsorCompPrintBarcode/);
  assert.match(renderer, /dangerouslySetInnerHTML/);
  assert.match(renderer, /\[&>svg\]:h-full \[&>svg\]:w-full/);
  assert.match(renderer, /Sponsor token required/);
  assert.match(properties, /isSponsorCompBarcode/);
  assert.match(properties, /cannot be edited/);
  assert.match(client, /SPONSOR_COMP_BARCODE_MIN_WIDTH = 42/);
  assert.match(client, /SPONSOR_COMP_BARCODE_MIN_HEIGHT = 22/);
  assert.match(client, /field\.type === "sponsor_comp_redemption_barcode"/);
});

test("barcode-specific sizing leaves the normal field minimum unchanged", async () => {
  const client = await source("app/print-studio/components/print-studio-client.tsx");

  assert.match(client, /: MIN_FIELD_SIZE/);
  assert.match(client, /width: clamp\(field\.width, minimumWidth, 100\)/);
  assert.match(client, /height: clamp\(field\.height, minimumHeight, 100\)/);
  assert.match(client, /rotation: 0/);
});

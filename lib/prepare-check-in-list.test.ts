import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  maskProjectionSource,
  normalizePrepareCheckInListRows,
  prepareCheckInList,
// @ts-expect-error Node's type-stripping test runner requires the TypeScript extension.
} from "./prepare-check-in-list.ts";

test("normalizes sanitized counts and keeps stable identity ID-based", () => {
  const result = normalizePrepareCheckInListRows([
    { source_type: "reserved_link", source_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", display_label: "Pamela Blevins", admission_type: "Paid Reserved", destination: "Prepaid / Online Check-In", result_status: "added", reason: "Created." },
    { source_type: "show_sponsor", source_id: "11111111-2222-3333-4444-555555555555", display_label: "CMMS Sponsor", admission_type: "Sponsor Comp", destination: "Sponsor Comp Check-In", result_status: "already_handled", reason: "Native." },
  ]);

  assert.equal(result.added, 1);
  assert.equal(result.alreadyHandled, 1);
  assert.match(result.details[0]?.maskedSourceIdentity ?? "", /^reserved_link:/);
  assert.notEqual(
    maskProjectionSource("reserved_link", "source-one"),
    maskProjectionSource("reserved_link", "source-two"),
  );
});

test("helper calls only the fixed prepare RPC once", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { data: [], error: null };
    },
  } as unknown as SupabaseClient;

  const result = await prepareCheckInList(client, "show-id", "show-slug");
  assert.deepEqual(calls, [{
    name: "prepare_show_check_in_list",
    args: { p_show_id: "show-id", p_show_slug: "show-slug" },
  }]);
  assert.equal(result.added, 0);
});

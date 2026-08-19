import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPageUrl = new URL("show-page.tsx", import.meta.url);

test("current show finance summary printout is totals-only and reuses displayed values", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const builderStart = source.indexOf("function buildCurrentShowFinanceSummaryHtml");
  const builderEnd = source.indexOf("function buildFinanceReportHtml", builderStart);
  const builder = source.slice(builderStart, builderEnd);
  const handlerStart = source.indexOf("function handlePrintCurrentShowFinanceSummary");
  const handlerEnd = source.indexOf("const loadShowData", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.ok(builderStart >= 0);
  assert.match(source, />\s*Print Show Summary\s*</);
  assert.match(builder, /Cumberland Mountain Music Show \/ StageFlow/);
  assert.match(builder, /Current Show Finance Summary/);
  assert.match(builder, /Total Income/);
  assert.match(builder, /Total Expenses/);
  assert.match(builder, /Net Profit \/ Loss/);
  assert.match(builder, /Overhead \/ Expenses/);
  assert.match(builder, /Profit Margin/);
  assert.match(builder, /Printed:/);
  assert.doesNotMatch(builder, /financeItems|Income Breakdown|Expense Breakdown|Notes|Category|Edit|Delete/);
  assert.match(handler, /totalIncome,/);
  assert.match(handler, /totalExpenses,/);
  assert.match(handler, /netProfit,/);
  assert.match(handler, /profitMargin,/);
  assert.match(handler, /openPrintDocumentWindow\(printHtml\)/);
});

test("existing detailed finance report remains available", async () => {
  const source = await readFile(showPageUrl, "utf8");

  assert.match(source, /function buildFinanceReportHtml/);
  assert.match(source, /function handlePrintFinanceReport/);
  assert.match(source, />\s*Print Finance Report\s*</);
});

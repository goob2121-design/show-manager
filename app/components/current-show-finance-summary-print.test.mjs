import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPageUrl = new URL("show-page.tsx", import.meta.url);

test("current show finance summary prints line items without notes and reuses displayed totals", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const builderStart = source.indexOf("function buildCurrentShowFinanceSummaryHtml");
  const builderEnd = source.indexOf("function buildFinanceReportHtml", builderStart);
  const builder = source.slice(builderStart, builderEnd);
  const handlerStart = source.indexOf("function handlePrintCurrentShowFinanceSummary");
  const handlerEnd = source.indexOf("const loadShowData", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.ok(builderStart >= 0);
  assert.doesNotMatch(source, />\s*Print Show Summary\s*</);
  assert.match(builder, /Cumberland Mountain Music Show \/ StageFlow/);
  assert.match(builder, /Current Show Finance Summary/);
  assert.match(builder, /Total Income/);
  assert.match(builder, /Total Expenses/);
  assert.match(builder, /Net Profit \/ Loss/);
  assert.match(builder, /Overhead \/ Expenses/);
  assert.match(builder, /Profit Margin/);
  assert.match(builder, /Printed:/);
  assert.match(builder, /incomeItems: ShowFinanceItem\[\]/);
  assert.match(builder, /expenseItems: ShowFinanceItem\[\]/);
  assert.match(builder, /<h2 id="income-heading">Income<\/h2>/);
  assert.match(builder, /<h2 id="expenses-heading">Expenses<\/h2>/);
  assert.match(builder, /<th>Description<\/th>/);
  assert.match(builder, /<th>Category<\/th>/);
  assert.match(builder, /<th class="amount">Amount<\/th>/);
  assert.match(builder, /escapeHtml\(item\.label\)/);
  assert.match(builder, /escapeHtml\(item\.category \?\? "Uncategorized"\)/);
  assert.match(builder, /formatCurrency\(item\.amount\)/);
  assert.match(builder, /buildLineItemRows\(incomeItems\)/);
  assert.match(builder, /buildLineItemRows\(expenseItems\)/);
  assert.doesNotMatch(builder, /item\.notes|<th>Notes<\/th>/);
  assert.doesNotMatch(builder, /Edit|Delete/);
  assert.match(handler, /totalIncome,/);
  assert.match(handler, /totalExpenses,/);
  assert.match(handler, /netProfit,/);
  assert.match(handler, /profitMargin,/);
  assert.match(handler, /incomeItems: incomeFinanceItems/);
  assert.match(handler, /expenseItems: expenseFinanceItems/);
  assert.match(handler, /openPrintDocumentWindow\(printHtml\)/);
});

test("existing detailed finance report remains available", async () => {
  const source = await readFile(showPageUrl, "utf8");

  assert.match(source, /function buildFinanceReportHtml/);
  assert.match(source, /function handlePrintFinanceReport/);
  assert.match(source, />\s*Print Finance Report\s*</);
});
test("letter print CSS avoids flex fragmentation and lets long tables paginate naturally", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const builderStart = source.indexOf("function buildCurrentShowFinanceSummaryHtml");
  const builderEnd = source.indexOf("function buildFinanceReportHtml", builderStart);
  const builder = source.slice(builderStart, builderEnd);
  const printCss = builder.slice(builder.indexOf("@media print"));

  assert.match(builder, /@page \{ size: letter; margin: 0\.5in; \}/);
  assert.match(printCss, /\.sheet \{ display: block; min-height: 0; \}/);
  assert.match(printCss, /\.line-items \{[\s\S]*?break-inside: auto;[\s\S]*?page-break-inside: auto;/);
  assert.match(printCss, /table \{ break-inside: auto; page-break-inside: auto; \}/);
  assert.match(printCss, /tr \{ break-inside: avoid; page-break-inside: avoid; \}/);
  assert.match(printCss, /thead \{ display: table-header-group; \}/);
  assert.doesNotMatch(printCss, /\.line-items[^}]*break-inside:\s*avoid/);
  assert.match(printCss, /\.summary-card \{ min-height: 58px; padding: 8px 12px; \}/);
  assert.match(printCss, /th, td \{ padding: 3px 7px; \}/);
});

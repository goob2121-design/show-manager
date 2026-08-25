import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showPageUrl = new URL("show-page.tsx", import.meta.url);

test("admin show page omits the large portal hero while guest and band retain it", async () => {
  const source = await readFile(showPageUrl, "utf8");
  assert.match(source, /const shouldShowPortalLogo = viewMode === "guest" \|\| viewMode === "band";/);
  assert.match(source, /const shouldUsePortalHero = shouldShowPortalLogo;/);
  assert.doesNotMatch(source, /shouldShowPortalLogo =[^;]*"admin"/);
  assert.match(source, /shouldUsePortalHero[\s\S]*portal_bkg\.png/);  assert.match(source, /\{show\.name\} <span[^>]*>• \{formatShowDate\(show\.show_date\)\} • Admin<\/span>/);
  assert.match(source, /isAdminView \? "py-3 sm:py-4" : "py-10"/);
  assert.match(source, /isAdminView \? "gap-3 p-4 sm:p-5" : "gap-6 p-6 sm:p-8"/);
  assert.doesNotMatch(source, /activeAdminTabLabel/);
  const adminSectionsStart = source.indexOf('{isAdminView ? (');
  const overviewStart = source.indexOf('{isAdminView && activeAdminTab === "overview"', adminSectionsStart);
  const adminSections = source.slice(adminSectionsStart, overviewStart);
  assert.match(adminSections, /className="print-hidden"/);
  assert.doesNotMatch(adminSections, /Active section:/);
});

test("selecting Reserved Seating opens only its inner panel by default", async () => {
  const source = await readFile(showPageUrl, "utf8");
  const handlerStart = source.indexOf('onSectionSelect={(sectionKey) => {');
  const handlerEnd = source.indexOf('totalsContent={', handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const reservedBranch = handler.slice(
    handler.indexOf('if (sectionKey === "reserved-seating")'),
    handler.indexOf('setActiveTicketWorkflowSection', handler.indexOf('if (sectionKey === "reserved-seating")')),
  );

  assert.match(reservedBranch, /setIsReservedSeatingOpen\(true\)/);
  assert.doesNotMatch(handler, /setIsTicketTotalsOpen\(true\)/);
  assert.doesNotMatch(handler, /setIsTicketImportOpen\(true\)/);
  assert.doesNotMatch(handler, /setIsManualTicketFormOpen\(true\)/);
});

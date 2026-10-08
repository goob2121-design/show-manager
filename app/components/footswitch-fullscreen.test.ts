import assert from "node:assert/strict";
import test from "node:test";
const { createDiagnosticFullscreen, supportsDiagnosticFullscreen } = await import(new URL("./footswitch-fullscreen.ts", import.meta.url).href) as typeof import("./footswitch-fullscreen");
function browser(enabled = true) {
  const doc = Object.assign(new EventTarget(), { fullscreenEnabled: enabled, fullscreenElement: null as unknown,
    documentElement: { requestFullscreen: () => Promise.resolve() }, exitFullscreen: () => Promise.resolve() });
  const statuses: { label: string; message: string; active: boolean }[] = [];
  return { doc, statuses, document: doc as unknown as Document };
}
const settle = () => Promise.resolve().then(() => Promise.resolve());

test("feature detection requires enabled root and exit APIs; unsupported requests leave normal lyrics available", () => {
  const b = browser(false);
  assert.equal(supportsDiagnosticFullscreen(b.document), false);
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  session.request();
  assert.equal(b.statuses.at(-1)?.label, "Unavailable");
  assert.equal(b.statuses.at(-1)?.active, false);
  assert.match(b.statuses.at(-1)?.message ?? "", /Normal lyrics/);
  session.destroy();
  const missing = browser();
  delete (missing.doc.documentElement as Partial<typeof missing.doc.documentElement>).requestFullscreen;
  assert.equal(supportsDiagnosticFullscreen(missing.document), false);
});

test("requests run synchronously on document root; only actual entry confirms success; exit and cleanup work", async () => {
  const b = browser();
  let requests = 0, exits = 0;
  b.doc.documentElement.requestFullscreen = () => { requests++; b.doc.fullscreenElement = b.doc.documentElement; b.doc.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
  b.doc.exitFullscreen = () => { exits++; b.doc.fullscreenElement = null; b.doc.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  session.request();
  assert.equal(requests, 1, "Request executes before the gesture handler returns");
  await settle();
  assert.equal(b.statuses.at(-1)?.label, "Fullscreen");
  assert.equal(b.statuses.at(-1)?.active, true);
  session.close();
  assert.equal(exits, 1);
  assert.equal(b.statuses.at(-1)?.label, "Normal");
  assert.equal(b.statuses.at(-1)?.active, false);
  session.destroy();
  const count = b.statuses.length;
  b.doc.dispatchEvent(new Event("fullscreenchange"));
  b.doc.dispatchEvent(new Event("fullscreenerror"));
  assert.equal(b.statuses.length, count);
});

test("rejected and unconfirmed requests never claim fullscreen and do not automatically retry", async () => {
  const b = browser();
  let requests = 0;
  b.doc.documentElement.requestFullscreen = () => { requests++; return Promise.reject(new Error("Denied")); };
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  session.request();
  await settle();
  assert.equal(requests, 1);
  assert.equal(b.statuses.at(-1)?.label, "Declined");
  assert.equal(b.statuses.at(-1)?.active, false);
  b.doc.documentElement.requestFullscreen = () => Promise.resolve();
  session.request();
  await settle();
  assert.equal(b.statuses.at(-1)?.label, "Not entered");
  assert.equal(b.statuses.some((status) => status.label === "Fullscreen"), false);
  session.destroy();
});

test("external fullscreen changes preserve normal display; failed exits provide a browser fallback", async () => {
  const b = browser();
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  b.doc.fullscreenElement = b.doc.documentElement;
  b.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(b.statuses.at(-1)?.label, "Fullscreen");
  b.doc.fullscreenElement = null;
  b.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(b.statuses.at(-1)?.label, "Normal");
  b.doc.fullscreenElement = {};
  b.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(b.statuses.at(-1)?.label, "Other view");
  b.doc.fullscreenElement = b.doc.documentElement;
  b.doc.exitFullscreen = () => Promise.reject(new Error("Exit denied"));
  session.close();
  await settle();
  assert.equal(b.statuses.at(-1)?.label, "Exit failed");
  assert.equal(b.statuses.at(-1)?.active, true, "Rejected exits retain the actual fullscreen calibration profile");
  session.destroy();
});

test("duplicate Close shares asynchronous exit; actual state changes only when the browser exits", async () => {
  const b = browser();
  b.doc.fullscreenElement = b.doc.documentElement;
  let finish!: () => void;
  let exits = 0;
  b.doc.exitFullscreen = () => { exits++; return new Promise<void>((resolve) => { finish = resolve; }); };
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  const first = session.close();
  const duplicate = session.close();
  assert.equal(first, duplicate);
  assert.equal(exits, 1);
  assert.equal(b.statuses.at(-1)?.active, true);
  b.doc.fullscreenElement = null;
  b.doc.dispatchEvent(new Event("fullscreenchange"));
  finish();
  await first;
  assert.equal(b.statuses.at(-1)?.active, false);
  assert.equal(b.statuses.at(-1)?.label, "Normal");
  session.destroy();
});

test("closing before a pending request completes exits late fullscreen and suppresses callbacks after unmount", async () => {
  const b = browser();
  let complete!: () => void;
  let requests = 0, exits = 0;
  b.doc.documentElement.requestFullscreen = () => { requests++; return new Promise<void>((resolve) => { complete = () => { b.doc.fullscreenElement = b.doc.documentElement; resolve(); }; }); };
  b.doc.exitFullscreen = () => { exits++; b.doc.fullscreenElement = null; return Promise.resolve(); };
  const session = createDiagnosticFullscreen(b.document, (value) => b.statuses.push(value));
  session.request();
  session.request();
  assert.equal(requests, 1, "An in-flight request is never repeated");
  session.close();
  session.destroy();
  const count = b.statuses.length;
  complete();
  await settle();
  assert.equal(exits, 1);
  assert.equal(b.doc.fullscreenElement, null);
  assert.equal(b.statuses.length, count);
});

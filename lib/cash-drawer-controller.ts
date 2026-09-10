import { openCashDrawer, type CashDrawerSerialPort } from "@/lib/cash-drawer-web-serial";

let connectedPort: CashDrawerSerialPort | null = null;
let portOpen = false;
let lastAutomaticOpen = 0;
const AUTOMATIC_COOLDOWN_MS = 4_000;

export function setCashDrawerPort(port: CashDrawerSerialPort | null) { connectedPort = port; portOpen = false; }
async function writeTrigger() {
  if (!connectedPort) throw new Error("No cash drawer is connected.");
  if (!portOpen) { await openCashDrawer(connectedPort); portOpen = true; return; }
  const writer = connectedPort.writable?.getWriter();
  if (!writer) { portOpen = false; throw new Error("Cash drawer connection was lost. Reconnect the drawer and try again."); }
  try { await writer.write(new TextEncoder().encode("A")); } finally { writer.releaseLock(); }
}
export async function openCashDrawerManually() { await writeTrigger(); lastAutomaticOpen = Date.now(); }
export async function openCashDrawerAfterPaidSale() {
  if (!connectedPort || Date.now() - lastAutomaticOpen < AUTOMATIC_COOLDOWN_MS) return false;
  await writeTrigger(); lastAutomaticOpen = Date.now(); return true;
}
export async function disconnectCashDrawer() { const port = connectedPort; connectedPort = null; portOpen = false; try { await port?.close(); } catch {} }
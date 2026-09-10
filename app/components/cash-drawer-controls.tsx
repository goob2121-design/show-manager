"use client";
import { useEffect, useState } from "react";
import { authorizedCashDrawerPorts, openCashDrawer, requestCashDrawerPort, type CashDrawerSerialPort, webSerialAvailable } from "@/lib/cash-drawer-web-serial";

export function CashDrawerControls() {
  const [port, setPort] = useState<CashDrawerSerialPort | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setSupported(webSerialAvailable()); void authorizedCashDrawerPorts().then((ports) => { if (ports.length) setPort(ports[0]); }).catch(() => null); }, []);
  async function connect() { setBusy(true); setMessage(null); try { setPort(await requestCashDrawerPort()); setMessage("Cash drawer selected. Use Test / Open Drawer to test it."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect the cash drawer."); } finally { setBusy(false); } }
  async function test() { if (!port) return; setBusy(true); setMessage(null); try { await openCashDrawer(port); setMessage("Cash drawer opened."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to open the cash drawer."); } finally { setBusy(false); } }
  async function disconnect() { try { await port?.close(); } catch {} setPort(null); setMessage("Cash drawer disconnected."); }
  return <section className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2" aria-label="Cash drawer controls"><div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${port ? "bg-emerald-400" : "bg-gray-500"}`} /><span className="text-xs font-semibold text-gray-200">Cash Drawer: {port ? "Connected" : "Disconnected"}</span>{supported ? <><button type="button" disabled={busy} onClick={() => void connect()} className="rounded-lg border border-gray-600 px-2 py-1 text-xs font-semibold">Connect Cash Drawer</button><button type="button" disabled={busy || !port} onClick={() => void test()} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Test / Open Drawer</button>{port ? <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-lg border border-gray-600 px-2 py-1 text-xs font-semibold">Disconnect</button> : null}</> : <span className="text-xs text-amber-200">Web Serial is unavailable in this browser.</span>}</div>{message ? <p className="mt-1 text-xs text-gray-300" role="status">{message}</p> : null}</section>;
}

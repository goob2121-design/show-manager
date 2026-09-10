export type CashDrawerSerialPort = {
  open: (options: { baudRate: number; dataBits: 8; parity: "none"; stopBits: 1 }) => Promise<void>;
  close: () => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort: () => Promise<CashDrawerSerialPort>;
    getPorts: () => Promise<CashDrawerSerialPort[]>;
  };
};

const encoder = new TextEncoder();

export function webSerialAvailable() {
  return typeof navigator !== "undefined" && Boolean((navigator as SerialNavigator).serial);
}

export async function requestCashDrawerPort() {
  const serial = (navigator as SerialNavigator).serial;
  if (!serial) throw new Error("Cash drawer connection requires a Chromium browser with Web Serial enabled.");
  return serial.requestPort();
}

export async function authorizedCashDrawerPorts() {
  const serial = (navigator as SerialNavigator).serial;
  return serial ? serial.getPorts() : [];
}

export async function openCashDrawer(port: CashDrawerSerialPort) {
  await port.open({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 });
  const writer = port.writable?.getWriter();
  if (!writer) throw new Error("The selected cash drawer port is not writable.");
  try { await writer.write(encoder.encode("A")); } finally { writer.releaseLock(); }
}

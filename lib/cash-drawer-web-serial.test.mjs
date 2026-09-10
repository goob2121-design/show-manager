import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync("lib/cash-drawer-web-serial.ts", "utf8");
test("drawer serial utility uses configured USB serial settings and trigger", () => { assert.match(source, /baudRate: 9600/); assert.match(source, /dataBits: 8/); assert.match(source, /parity: "none"/); assert.match(source, /stopBits: 1/); assert.match(source, /encode\("A"\)/); });

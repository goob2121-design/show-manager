import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Usage: node scripts/hash-door-staff-password.mjs \"a-password-of-at-least-12-characters\"");
  process.exitCode = 1;
} else {
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const salt = randomBytes(16);
  const derived = await promisify(scryptCallback)(password, salt, 64, { N: cost, r: blockSize, p: parallelization });
  console.log(`scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${derived.toString("base64url")}`);
}

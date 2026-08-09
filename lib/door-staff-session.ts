import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "crypto";

export const DOOR_STAFF_COOKIE_PREFIX = "stageflow_door_staff_session";
const DOOR_STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SCRYPT_KEY_LENGTH = 64;


export type DoorStaffSession = {
  role: "door_staff";
  showId: string;
  slug: string;
  expiresAt: number;
};

function getDoorStaffSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.NEXT_PUBLIC_ADMIN_PASSWORD
    || "";
  if (!secret) throw new Error("Missing Door Staff session signing secret.");
  return `stageflow-door-staff-v1:${secret}`;
}

function sign(payload: string) {
  return createHmac("sha256", getDoorStaffSessionSecret()).update(payload).digest("base64url");
}

export function getDoorStaffSessionCookieName(slug: string) {
  return `${DOOR_STAFF_COOKIE_PREFIX}_${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function createDoorStaffSessionCookieValue(showId: string, slug: string) {
  const session: DoorStaffSession = {
    role: "door_staff",
    showId,
    slug,
    expiresAt: Math.floor(Date.now() / 1000) + DOOR_STAFF_SESSION_MAX_AGE_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyDoorStaffSessionCookieValue(
  expectedSlug: string,
  cookieValue: string | undefined | null,
  expectedShowId?: string,
): DoorStaffSession | null {
  if (!cookieValue) return null;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  const expectedSignature = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<DoorStaffSession>;
    if (session.role !== "door_staff" || session.slug !== expectedSlug || typeof session.showId !== "string") return null;
    if (expectedShowId && session.showId !== expectedShowId) return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return session as DoorStaffSession;
  } catch {
    return null;
  }
}

export async function verifyDoorStaffPassword(password: string, encodedHash: string) {
  const [algorithm, costRaw, blockSizeRaw, parallelizationRaw, salt, expectedHash] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) return false;

  try {
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scryptCallback(password, Buffer.from(salt, "base64url"), SCRYPT_KEY_LENGTH, {
        N: cost,
        r: blockSize,
        p: parallelization,
      }, (error, key) => error ? reject(error) : resolve(key));
    });
    const expected = Buffer.from(expectedHash, "base64url");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export const doorStaffSessionMaxAgeSeconds = DOOR_STAFF_SESSION_MAX_AGE_SECONDS;

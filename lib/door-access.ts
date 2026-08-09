import { verifyAdminSessionCookieValue } from "@/lib/admin-session";
import { verifyDoorStaffSessionCookieValue } from "@/lib/door-staff-session";

export type DoorAccessRole = "admin" | "door_staff";

export function resolveDoorAccess(input: {
  slug: string;
  showId?: string;
  adminCookieValue?: string | null;
  doorStaffCookieValue?: string | null;
}): DoorAccessRole | null {
  if (verifyAdminSessionCookieValue(input.slug, input.adminCookieValue)) return "admin";
  return verifyDoorStaffSessionCookieValue(input.slug, input.doorStaffCookieValue, input.showId)
    ? "door_staff"
    : null;
}

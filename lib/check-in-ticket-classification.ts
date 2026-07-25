export type CheckInTicketDestination = "prepaid_online" | "special_admissions" | "paid_door";

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function checkInTicketDestination(
  ticketType: string | null | undefined,
  notes: string | null | undefined,
): CheckInTicketDestination {
  const type = normalized(ticketType);
  if (type === "door_paid") return "paid_door";
  if (type === "paid_online") return "prepaid_online";
  if (type === "manual" && /\b(paid|prepaid|purchased|general admission|paid reserved)\b/.test(normalized(notes))) {
    return "prepaid_online";
  }
  return "special_admissions";
}

export function checkInAdmissionLabel(
  ticketType: string | null | undefined,
  notes: string | null | undefined,
) {
  const type = normalized(ticketType);
  const text = normalized(notes);
  if (type === "door_paid") return "Paid Door";
  if (type === "paid_online" && /\[admission type:\s*reserved\]/.test(text)) return "Paid Reserved";
  if (type === "paid_online") return "Paid General Admission";
  if (type === "manual" && checkInTicketDestination(type, notes) === "prepaid_online") {
    return text.includes("reserved") ? "Paid Reserved" : "Paid General Admission";
  }
  if (/\[comp type:\s*band\]/.test(text)) return "Band Comp";
  if (/\[comp type:\s*(media|press)\]/.test(text)) return "Media / Press";
  if (/\[comp type:\s*volunteer\]/.test(text)) return "Volunteer";
  if (/\[comp type:\s*staff\]/.test(text)) return "Staff";
  if (/\[comp type:\s*other\]/.test(text)) return "Other";
  if (/\[comp type:\s*guest\]/.test(text)) return "Guest Comp";
  return type === "manual" ? "Other" : "Guest Comp";
}

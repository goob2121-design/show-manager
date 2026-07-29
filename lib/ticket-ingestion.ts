import type { SupabaseClient } from "@supabase/supabase-js";
import { tryGenerateReservationScanToken } from "@/lib/reservation-scan-tokens";
import type { ShowCompTicket, ShowReservedSeatingLink } from "@/lib/types";

export type ExternalTicketIngestionStatus =
  | "imported"
  | "duplicate"
  | "unmapped_item"
  | "incomplete_customer"
  | "ignored_status"
  | "error";

type TicketLike = Pick<
  ShowCompTicket,
  "id" | "guest_name" | "email" | "ticket_count" | "order_id" | "import_key"
>;

export type ReservedSeatingSyncResult = {
  createdCount: number;
  updatedCount: number;
  warnings: string[];
  linkIds: string[];
  actions: ReservedSeatLinkAction[];
};

export type ReservedSeatLinkAction = "created" | "existing_current_ticket" | "claimed_legacy" | "failed";

export type IngestExternalTicketSaleInput = {
  source: "square";
  eventId: string;
  paymentId: string;
  orderId: string;
  lineItemUid: string;
  catalogVariationId: string;
  purchaserName: string | null;
  purchaserEmail: string | null;
  quantity: number;
  amountPaid: number | null;
  currency: string | null;
  paymentStatus: string;
  payloadSummary?: Record<string, unknown>;
};

export type IngestExternalTicketSaleResult = {
  status: ExternalTicketIngestionStatus;
  showId: string | null;
  showName: string | null;
  ticketId: string | null;
  orderId: string | null;
  lineItemUid: string | null;
  catalogVariationId: string | null;
  ticketCount: number | null;
  emailPresent: boolean;
  seatLinkCreated: boolean;
  seatLinkAction?: ReservedSeatLinkAction;
  errorMessage?: string;
};

function normalizeOptionalField(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeLookupValue(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function buildReservedSeatingCustomerMatchKey(name: string, email: string | null | undefined) {
  return [normalizeLookupValue(name) || "unknown-buyer", normalizeLookupValue(email) || "no-email"].join("::");
}

function isUnclaimedReservedSeatingLink(link: ShowReservedSeatingLink) {
  return !normalizeOptionalField(link.source_ticket_id)
    && !normalizeOptionalField(link.source_order_id)
    && !normalizeOptionalField(link.source_import_key);
}

export function findOwnedOrClaimableReservedSeatingLink(
  links: ShowReservedSeatingLink[],
  ticket: TicketLike,
) {
  const sourceOrderId = normalizeOptionalField(ticket.order_id);
  const sourceImportKey = normalizeOptionalField(ticket.import_key);
  const exactTicketLink = links.find((link) => link.source_ticket_id === ticket.id);
  if (exactTicketLink) return { link: exactTicketLink, action: "existing_current_ticket" as const };

  if (sourceOrderId && sourceImportKey) {
    const exactImportLink = links.find(
      (link) => (!normalizeOptionalField(link.source_ticket_id) || link.source_ticket_id === ticket.id)
        && normalizeOptionalField(link.source_order_id) === sourceOrderId
        && normalizeOptionalField(link.source_import_key) === sourceImportKey,
    );
    if (exactImportLink) return { link: exactImportLink, action: "existing_current_ticket" as const };
  }

  const customerMatchKey = buildReservedSeatingCustomerMatchKey(ticket.guest_name, ticket.email);
  const legacyLink = links.find(
    (link) => isUnclaimedReservedSeatingLink(link)
      && buildReservedSeatingCustomerMatchKey(link.customer_name, link.email) === customerMatchKey,
  );
  return legacyLink ? { link: legacyLink, action: "claimed_legacy" as const } : null;
}

export function buildExternalImportKey(input: Pick<IngestExternalTicketSaleInput, "source" | "orderId" | "lineItemUid">) {
  return [input.source, "order", input.orderId, "line", input.lineItemUid].join("::");
}

export async function syncReservedSeatingLinksForImportedOrders(
  supabase: SupabaseClient,
  showId: string,
  importedTickets: TicketLike[],
): Promise<ReservedSeatingSyncResult> {
  const [{ data: existingLinks, error: existingLinksError }, { data: existingAssignments, error: existingAssignmentsError }] = await Promise.all([
    supabase.from("show_reserved_seating_links").select("*").eq("show_id", showId),
    supabase
      .from("show_reserved_seat_assignments")
      .select("seating_link_id")
      .eq("show_id", showId)
      .not("seating_link_id", "is", null),
  ]);

  if (existingLinksError) throw existingLinksError;
  if (existingAssignmentsError) throw existingAssignmentsError;

  const links = ((existingLinks ?? []) as ShowReservedSeatingLink[]).map((link) => ({ ...link }));
  const selectedLinkIds = new Set(
    ((existingAssignments ?? []) as Array<{ seating_link_id: string | null }>)
      .map((item) => item.seating_link_id)
      .filter((value): value is string => Boolean(value)),
  );

  const createdRows: Array<{
    values: Record<string, string | number | null>;
    actionIndex: number;
  }> = [];
  const updatedRows: Array<{ id: string; updates: Record<string, string | number | null> }> = [];
  const warnings: string[] = [];
  const linkIds: string[] = [];
  const actions: ReservedSeatLinkAction[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const ticket of importedTickets) {
    const sourceOrderId = normalizeOptionalField(ticket.order_id);
    const sourceImportKey = normalizeOptionalField(ticket.import_key);
    const match = findOwnedOrClaimableReservedSeatingLink(links, ticket);
    const matchedLink = match?.link;

    const baseUpdates: Record<string, string | number | null> = {
      customer_name: ticket.guest_name,
      email: normalizeOptionalField(ticket.email),
      source_ticket_id: ticket.id,
      source_order_id: sourceOrderId,
      source_import_key: sourceImportKey,
      selection_mode: "imported",
      seat_category: "paid_reserved",
    };

    if (!matchedLink) {
      createdRows.push({
        values: {
          show_id: showId,
          customer_name: ticket.guest_name,
          email: normalizeOptionalField(ticket.email),
          ticket_count: ticket.ticket_count,
          scan_token: tryGenerateReservationScanToken(),
          selection_mode: "imported",
          seat_category: "paid_reserved",
          source_ticket_id: ticket.id,
          source_order_id: sourceOrderId,
          source_import_key: sourceImportKey,
        },
        actionIndex: actions.length,
      });
      createdCount += 1;
      actions.push("created");
      continue;
    }

    linkIds.push(matchedLink.id);
    actions.push(match.action);
    const hasSelectedSeats = selectedLinkIds.has(matchedLink.id) || Boolean(matchedLink.submitted_at);
    const shouldUpdateTicketCount = !hasSelectedSeats && matchedLink.ticket_count !== ticket.ticket_count;
    if (hasSelectedSeats && matchedLink.ticket_count !== ticket.ticket_count) {
      warnings.push(`${ticket.guest_name}: imported quantity is now ${ticket.ticket_count}, but reserved seats were already selected. Seat limit was not changed.`);
    }

    const updates: Record<string, string | number | null> = { ...baseUpdates };
    if (shouldUpdateTicketCount) updates.ticket_count = ticket.ticket_count;
    updatedRows.push({ id: matchedLink.id, updates });
    updatedCount += 1;
    Object.assign(matchedLink, updates);
    if (typeof updates.ticket_count === "number") matchedLink.ticket_count = updates.ticket_count;
  }

  for (const row of createdRows) {
    const { data, error } = await supabase
      .from("show_reserved_seating_links")
      .insert([row.values])
      .select("id");

    if (!error) {
      linkIds.push(...((data ?? []) as Array<{ id: string }>).map((item) => item.id));
      continue;
    }

    const diagnostic = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    const isExpectedOwnershipRace = error.code === "23505"
      && diagnostic.includes("show_reserved_seating_links_show_id_source_ticket_id_unique");
    const sourceTicketId = normalizeOptionalField(row.values.source_ticket_id as string | null);
    if (!isExpectedOwnershipRace || !sourceTicketId) throw error;

    const { data: canonicalLink, error: canonicalLinkError } = await supabase
      .from("show_reserved_seating_links")
      .select("id")
      .eq("show_id", showId)
      .eq("source_ticket_id", sourceTicketId)
      .maybeSingle();
    if (canonicalLinkError) throw canonicalLinkError;
    if (!canonicalLink) throw error;

    createdCount -= 1;
    actions[row.actionIndex] = "existing_current_ticket";
    linkIds.push((canonicalLink as { id: string }).id);
  }

  for (const row of updatedRows) {
    const { error } = await supabase.from("show_reserved_seating_links").update(row.updates).eq("id", row.id);
    if (error) throw error;
  }

  return { createdCount, updatedCount, warnings, linkIds, actions };
}

export async function ingestExternalTicketSale(
  supabase: SupabaseClient,
  input: IngestExternalTicketSaleInput,
): Promise<IngestExternalTicketSaleResult> {
  if (input.paymentStatus !== "COMPLETED") {
    return {
      status: "ignored_status",
      showId: null,
      showName: null,
      ticketId: null,
      orderId: input.orderId,
      lineItemUid: input.lineItemUid,
      catalogVariationId: input.catalogVariationId,
      ticketCount: null,
      emailPresent: Boolean(input.purchaserEmail?.trim()),
      seatLinkCreated: false,
    };
  }

  const quantity = Math.max(1, Math.floor(input.quantity) || 1);
  const purchaserName = normalizeOptionalField(input.purchaserName) ?? "Square Customer";
  const purchaserEmail = normalizeOptionalField(input.purchaserEmail);
  const importKey = buildExternalImportKey(input);
  const now = new Date().toISOString();

  const { data: show, error: showError } = await supabase
    .from("shows")
    .select("id, name")
    .eq("square_catalog_variation_id", input.catalogVariationId)
    .maybeSingle();

  if (showError) throw showError;
  const typedShow = show as { id: string; name: string } | null;

  if (!typedShow) {
    return {
      status: "unmapped_item",
      showId: null,
      showName: null,
      ticketId: null,
      orderId: input.orderId,
      lineItemUid: input.lineItemUid,
      catalogVariationId: input.catalogVariationId,
      ticketCount: quantity,
      emailPresent: Boolean(purchaserEmail),
      seatLinkCreated: false,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("show_comp_tickets")
    .select("*")
    .eq("external_source", input.source)
    .eq("external_payment_id", input.paymentId)
    .eq("external_order_id", input.orderId)
    .eq("external_line_item_uid", input.lineItemUid)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const existingTicket = existing as ShowCompTicket;
    const sync = await syncReservedSeatingLinksForImportedOrders(supabase, typedShow.id, [existingTicket]);
    return {
      status: "duplicate",
      showId: typedShow.id,
      showName: typedShow.name,
      ticketId: existingTicket.id,
      orderId: input.orderId,
      lineItemUid: input.lineItemUid,
      catalogVariationId: input.catalogVariationId,
      ticketCount: existingTicket.ticket_count,
      emailPresent: Boolean(existingTicket.email?.trim()),
      seatLinkCreated: sync.linkIds.length > 0,
    seatLinkAction: sync.actions[0] ?? "failed",
    };
  }

  const payload = {
    show_id: typedShow.id,
    guest_name: purchaserName,
    email: purchaserEmail,
    ticket_count: quantity,
    ticket_type: "paid_online",
    order_id: input.orderId,
    import_key: importKey,
    notes: "Imported from Square Sandbox webhook. Purchaser email not sent in Phase 1.",
    checked_in: false,
    checked_in_count: 0,
    external_source: input.source,
    external_event_id: input.eventId,
    external_payment_id: input.paymentId,
    external_order_id: input.orderId,
    external_line_item_uid: input.lineItemUid,
    external_catalog_variation_id: input.catalogVariationId,
    external_status: input.paymentStatus,
    external_payload_summary: input.payloadSummary ?? null,
    imported_at: now,
  };

  const { data: inserted, error: insertError } = await supabase.from("show_comp_tickets").insert(payload).select("*").single();
  if (insertError) throw insertError;

  const insertedTicket = inserted as ShowCompTicket;
  const sync = await syncReservedSeatingLinksForImportedOrders(supabase, typedShow.id, [insertedTicket]);

  return {
    status: purchaserEmail ? "imported" : "incomplete_customer",
    showId: typedShow.id,
    showName: typedShow.name,
    ticketId: insertedTicket.id,
    orderId: input.orderId,
    lineItemUid: input.lineItemUid,
    catalogVariationId: input.catalogVariationId,
    ticketCount: quantity,
    emailPresent: Boolean(purchaserEmail),
    seatLinkCreated: sync.linkIds.length > 0,
      seatLinkAction: sync.actions[0] ?? "failed",
  };
}

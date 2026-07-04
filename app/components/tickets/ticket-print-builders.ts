import type {
  ShowCompTicket,
  ShowRecord,
  ShowReservedSeatAssignment,
  ShowReservedSeatingLink,
  ShowSponsor,
} from "@/lib/types";

export type CompAdmissionType = "reserved" | "general_admission";

export type CompListReportRow = {
  id: string;
  name: string;
  category: "sponsor" | "band" | "guest" | "volunteer" | "media" | "staff" | "other";
  categoryLabel: string;
  admissionType: CompAdmissionType;
  quantity: number;
  reservedSeats: string;
  checkedIn: number;
  notes: string;
};

export type CompTicketPrintScope = "sponsor" | "non_sponsor" | "all" | `category:${CompListReportRow["category"]}` | `row:${string}`;

type GeneralAdmissionTicketFormState = {
  quantity: string;
  showEvent: string;
  showDate: string;
  doorsTime: string;
  showTime: string;
  ticketPrefix: string;
  ticketStartNumber: string;
};

type TicketPrintBuilderContext = {
  show: ShowRecord | null;
  sponsorsWithCompTickets: ShowSponsor[];
  compTickets: ShowCompTicket[];
  sponsorTicketReservedLinks: ShowReservedSeatingLink[];
  sponsorTicketReservedAssignments: ShowReservedSeatAssignment[];
  sponsorTicketSponsorId: string;
  selectedSponsorTicketSeatIds: string[];
  activeSponsorTicketTemplateUrl: string | null | undefined;
  activeGeneralTicketTemplateUrl: string | null | undefined;
  activeGeneralAdmissionTicketTemplateUrl: string | null | undefined;
  generalAdmissionTicketFormState: GeneralAdmissionTicketFormState;
  getSponsorTicketSponsorName: (sponsor: ShowSponsor) => string;
  normalizeGuestListTicketType: (ticketType: ShowCompTicket["ticket_type"]) => string;
  stripCompMetadataFromNotes: (notes: string | null | undefined) => string;
  sortReservedSeatIds: (seatIds: string[]) => string[];
  formatReservedSeatLabel: (seatId: string) => string;
  formatShowDate: (showDate: string | null) => string;
  escapeHtml: (value: string | number | null | undefined) => string;
};

export function createTicketPrintBuilders(context: TicketPrintBuilderContext) {
  const {
    show,
    sponsorsWithCompTickets,
    compTickets,
    sponsorTicketReservedLinks,
    sponsorTicketReservedAssignments,
    sponsorTicketSponsorId,
    selectedSponsorTicketSeatIds,
    activeSponsorTicketTemplateUrl,
    activeGeneralTicketTemplateUrl,
    activeGeneralAdmissionTicketTemplateUrl,
    generalAdmissionTicketFormState,
    getSponsorTicketSponsorName,
    normalizeGuestListTicketType,
    stripCompMetadataFromNotes,
    sortReservedSeatIds,
    formatReservedSeatLabel,
    formatShowDate,
    escapeHtml,
  } = context;
  function getCompListReservedSeatsForName(name: string) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) return "";
    const matchedLinks = sponsorTicketReservedLinks.filter((link) => {
      const customerName = link.customer_name.trim().toLowerCase();
      return customerName.includes(normalizedName) || normalizedName.includes(customerName);
    });
    const matchedLinkIds = new Set(matchedLinks.map((link) => link.id));
    const matchedSeatIds = sponsorTicketReservedAssignments.filter((assignment) => {
      const assignmentName = assignment.customer_name?.trim().toLowerCase() ?? "";
      return assignment.seating_link_id ? matchedLinkIds.has(assignment.seating_link_id) : assignmentName.includes(normalizedName) || normalizedName.includes(assignmentName);
    }).map((assignment) => assignment.seat_id);
    return sortReservedSeatIds(matchedSeatIds).map((seatId) => formatReservedSeatLabel(seatId)).join(", ");
  }

  function parseCompCategoryFromText(text: string): CompListReportRow["category"] | null {
    const normalizedText = text.toLowerCase();
    const markerMatch = normalizedText.match(/\[comp type:\s*(sponsor|band|guest|volunteer|media|staff|other)\]/);
    if (markerMatch?.[1] === "sponsor" || markerMatch?.[1] === "band" || markerMatch?.[1] === "guest" || markerMatch?.[1] === "volunteer" || markerMatch?.[1] === "media" || markerMatch?.[1] === "staff" || markerMatch?.[1] === "other") {
      return markerMatch[1] as CompListReportRow["category"];
    }
    if (normalizedText.includes("sponsor")) return "sponsor";
    if (normalizedText.includes("band")) return "band";
    if (normalizedText.includes("guest")) return "guest";
    if (normalizedText.includes("volunteer")) return "volunteer";
    if (normalizedText.includes("media") || normalizedText.includes("press")) return "media";
    if (normalizedText.includes("staff")) return "staff";
    return null;
  }

  function parseCompAdmissionTypeFromText(text: string): CompAdmissionType {
    const normalizedText = text.toLowerCase();
    const markerMatch = normalizedText.match(/\[admission type:\s*(reserved|general_admission)\]/);
    return markerMatch?.[1] === "general_admission" ? "general_admission" : "reserved";
  }

  function classifyCompTicket(item: ShowCompTicket): CompListReportRow["category"] {
    const parsedCategory = parseCompCategoryFromText(`${item.guest_name} ${item.notes ?? ""} ${item.order_id ?? ""}`);
    if (parsedCategory && parsedCategory !== "sponsor") return parsedCategory;
    return normalizeGuestListTicketType(item.ticket_type) === "manual" ? "other" : "guest";
  }

  function getCompListCategoryLabel(category: CompListReportRow["category"]) {
    if (category === "sponsor") return "Sponsor Comp";
    if (category === "band") return "Band Comp";
    if (category === "guest") return "Guest Comp";
    if (category === "volunteer") return "Volunteer Comp";
    if (category === "media") return "Media Comp";
    if (category === "staff") return "Staff Comp";
    return "Other Comp";
  }

  function getCompAdmissionTypeLabel(admissionType: CompAdmissionType) {
    return admissionType === "general_admission" ? "General Admission" : "Reserved Seating";
  }

  function buildCompListReportRows() {
    const sponsorRows: CompListReportRow[] = sponsorsWithCompTickets.map((sponsor) => {
      const name = getSponsorTicketSponsorName(sponsor);
      return { id: `sponsor-${sponsor.id}`, name, category: "sponsor", categoryLabel: "Sponsor Comp", quantity: Math.max(0, sponsor.comp_ticket_allowance ?? 0), reservedSeats: getCompListReservedSeatsForName(name), checkedIn: Math.max(0, sponsor.comp_tickets_checked_in ?? 0), notes: stripCompMetadataFromNotes(sponsor.recognition_notes), admissionType: parseCompAdmissionTypeFromText(sponsor.recognition_notes ?? "") };
    });
    const compRows: CompListReportRow[] = compTickets.filter((item) => {
      const ticketType = normalizeGuestListTicketType(item.ticket_type);
      return ticketType !== "paid_online" && ticketType !== "door_paid";
    }).map((item) => {
      const category = classifyCompTicket(item);
      return { id: `comp-${item.id}`, name: item.guest_name, category, categoryLabel: getCompListCategoryLabel(category), quantity: item.ticket_count, reservedSeats: getCompListReservedSeatsForName(item.guest_name), checkedIn: item.checked_in_count, notes: stripCompMetadataFromNotes(item.notes), admissionType: parseCompAdmissionTypeFromText(item.notes ?? "") };
    });
    const existingKeys = new Set([...sponsorRows, ...compRows].map((row) => row.name.trim().toLowerCase()).filter(Boolean));
    const reservedOnlyRowsByName = new Map<string, CompListReportRow>();
    sponsorTicketReservedAssignments.forEach((assignment) => {
      const name = assignment.customer_name?.trim() || "Reserved Comp Guest";
      const key = name.toLowerCase();
      if (!key || existingKeys.has(key)) return;
      const linkedSourceNote = assignment.seating_link_id ? sponsorTicketReservedLinks.find((link) => link.id === assignment.seating_link_id)?.source_note ?? "" : "";
      const category: CompListReportRow["category"] = parseCompCategoryFromText(linkedSourceNote) ?? (assignment.seat_category === "guest" ? "guest" : "other");
      const current = reservedOnlyRowsByName.get(key);
      const seatLabel = formatReservedSeatLabel(assignment.seat_id);
      if (current) {
        current.quantity += 1;
        current.reservedSeats = current.reservedSeats ? `${current.reservedSeats}, ${seatLabel}` : seatLabel;
      } else {
        reservedOnlyRowsByName.set(key, { id: `reserved-comp-${assignment.id}`, name, category, categoryLabel: getCompListCategoryLabel(category), admissionType: parseCompAdmissionTypeFromText(linkedSourceNote), quantity: 1, reservedSeats: seatLabel, checkedIn: 0, notes: stripCompMetadataFromNotes(linkedSourceNote) || "Reserved seating comp" });
      }
    });
    return [...sponsorRows, ...compRows, ...reservedOnlyRowsByName.values()];
  }

  function buildSponsorCompListPrintHtml({ printMode }: { printMode: "print" | "pdf" }) {
    const rows = buildCompListReportRows();
    const groupedRows = [
      { title: "Sponsor Comps", rows: rows.filter((row) => row.category === "sponsor") },
      { title: "Band Comps", rows: rows.filter((row) => row.category === "band") },
      { title: "Guest Comps", rows: rows.filter((row) => row.category === "guest") },
      { title: "Volunteer / Media / Other Comps", rows: rows.filter((row) => row.category === "other") },
    ];
    const totalSponsorComps = groupedRows[0].rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalBandComps = groupedRows[1].rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalGuestOtherComps = [...groupedRows[2].rows, ...groupedRows[3].rows].reduce((sum, row) => sum + row.quantity, 0);
    const totalComplimentaryTickets = rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalCheckedIn = rows.reduce((sum, row) => sum + row.checkedIn, 0);
    const generatedAt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
    const groupMarkup = groupedRows.map((group) => `<section class="group"><h2>${escapeHtml(group.title)}</h2>${group.rows.length === 0 ? '<p class="empty">No entries in this category.</p>' : `<table><thead><tr><th>Name / Sponsor</th><th>Comp Type</th><th>Qty</th><th>Reserved Seat(s)</th><th>Checked In</th><th>Notes</th></tr></thead><tbody>${group.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.categoryLabel)}</td><td class="number">${escapeHtml(String(row.quantity))}</td><td>${escapeHtml(row.reservedSeats || "-")}</td><td>${escapeHtml(`${row.checkedIn} of ${row.quantity}`)}</td><td>${escapeHtml(row.notes || "-")}</td></tr>`).join("")}</tbody></table>`}</section>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(show?.name ?? "Show")} Sponsor & Comp Ticket List</title><style>@page{size:letter portrait;margin:.45in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1c1917;background:#fff}h1{margin:0;font-size:24px}h2{margin:24px 0 8px;font-size:16px;border-bottom:2px solid #d6d3d1;padding-bottom:5px}.meta{margin-top:6px;color:#57534e;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#f5f5f4;color:#44403c;border:1px solid #d6d3d1;padding:6px}td{border:1px solid #e7e5e4;padding:6px;vertical-align:top}.number{text-align:right;font-weight:700}.empty{margin:0;border:1px dashed #d6d3d1;padding:10px;color:#78716c;font-size:12px}.totals{margin-top:24px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;break-inside:avoid}.total-card{border:1px solid #d6d3d1;background:#fafaf9;padding:10px}.total-label{color:#57534e;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.total-value{margin-top:4px;font-size:20px;font-weight:800}@media print{.group{break-inside:avoid}}</style></head><body><header><h1>Sponsor & Comp Ticket List</h1><p class="meta">${escapeHtml(show?.name ?? "Show")} - ${escapeHtml(formatShowDate(show?.show_date ?? null))} - Generated ${escapeHtml(generatedAt)}</p></header>${groupMarkup}<section class="totals"><div class="total-card"><div class="total-label">Sponsor Comps</div><div class="total-value">${totalSponsorComps}</div></div><div class="total-card"><div class="total-label">Band Comps</div><div class="total-value">${totalBandComps}</div></div><div class="total-card"><div class="total-label">Guest / Other</div><div class="total-value">${totalGuestOtherComps}</div></div><div class="total-card"><div class="total-label">Total Comps</div><div class="total-value">${totalComplimentaryTickets}</div></div><div class="total-card"><div class="total-label">Checked In</div><div class="total-value">${totalCheckedIn}</div></div></section><script>${printMode === "pdf" || printMode === "print" ? "window.onload = () => { window.focus(); window.print(); };" : ""}</script></body></html>`;
  }

  function buildSponsorTicketPrintHtml({ printMode }: { printMode: "print" | "pdf" }) {
    const sponsor = sponsorsWithCompTickets.find((item) => item.id === sponsorTicketSponsorId) ?? null;
    const selectedSeatIds = sortReservedSeatIds(selectedSponsorTicketSeatIds);

    if (!show || !sponsor || !activeSponsorTicketTemplateUrl || selectedSeatIds.length === 0) {
      return null;
    }

    const sponsorName = getSponsorTicketSponsorName(sponsor);
    const showDate = formatShowDate(show.show_date);
    const doorsTime = show.guest_arrival_time || "6:00 PM";
    const showTime = show.show_start_time || "TBD";
    const totalTickets = selectedSeatIds.length;
    const tickets = selectedSeatIds.map((seatId, index) => ({
      seatLabel: formatReservedSeatLabel(seatId),
      ticketNumber: `${index + 1} of ${totalTickets}`,
    }));
    const ticketSheets = Array.from({ length: Math.ceil(tickets.length / 4) }, (_, sheetIndex) => tickets.slice(sheetIndex * 4, sheetIndex * 4 + 4));

    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(sponsorName)} Sponsor Tickets</title><style>
      @page { size: 8.5in 11in portrait; margin: .18in; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #111; font-family: Arial, Helvetica, sans-serif; }
      .ticket-sheet { width: 8.14in; height: 10.64in; display: grid; grid-template-columns: 5.26in; grid-template-rows: repeat(4, 2.55in); gap: .08in; align-content: center; justify-content: center; page-break-after: always; overflow: hidden; background: #fff; }
      .ticket-slot { width: 5.26in; height: 2.55in; overflow: hidden; position: relative; background: #000; }
      .ticket-page { width: 11in; height: 5.33in; position: absolute; left: 0; top: 0; overflow: hidden; background: #000; transform: scale(.478); transform-origin: top left; }
      .ticket-page img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .field { position: absolute; color: #14110d; font-weight: 800; letter-spacing: 0.02em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sponsor { left: 1.15in; top: 2.69in; width: 3.05in; font-size: .18in; }
      .date { left: 5.25in; top: 3.15in; width: 1.82in; font-size: .15in; }
      .time { left: 3.06in; top: 3.62in; width: 1.15in; text-align: center; font-size: .15in; }
      .event { left: 1.34in; top: 3.15in; width: 2.9in; font-size: .125in; letter-spacing: 0; text-overflow: clip; }
      .count { left: 5.78in; top: 3.62in; width: 1.18in; text-align: center; font-size: .17in; }
      .seat-main { left: 1.58in; top: 4.09in; width: 5.5in; font-size: .18in; }
      .doors-main { left: .88in; top: 3.62in; width: 1.15in; text-align: center; font-size: .15in; }
      .stub-count { left: 8.88in; top: 2.34in; width: 1.58in; height: .42in; display: flex; align-items: center; justify-content: center; text-align: center; color: #17120e; font-size: .34in; font-weight: 900; letter-spacing: 0; line-height: 1; white-space: nowrap; overflow: visible; text-overflow: clip; }
      .stub-seat { left: 8.72in; top: 3.39in; width: 1.87in; text-align: center; color: #2d2721; font-size: .3in; font-weight: 900; }
      @media print { body { background: #fff; } .ticket-sheet { break-after: page; } .ticket-sheet:last-child { break-after: auto; } }
    </style></head><body>${ticketSheets.map((sheet) => `<section class="ticket-sheet">${sheet.map((ticket) => `<div class="ticket-slot"><div class="ticket-page"><img src="${activeSponsorTicketTemplateUrl}" alt="" />
      <div class="field sponsor">${escapeHtml(sponsorName)}</div>
      <div class="field event">${escapeHtml(show.name)}</div>
      <div class="field date">${escapeHtml(showDate)}</div>
      <div class="field doors-main">${escapeHtml(doorsTime)}</div>
      <div class="field time">${escapeHtml(showTime)}</div>
      <div class="field count">${escapeHtml(String(totalTickets))}</div>
      <div class="field seat-main">${escapeHtml(ticket.seatLabel)}</div>
      <div class="field stub-count">${escapeHtml(ticket.ticketNumber)}</div>
      <div class="field stub-seat">${escapeHtml(ticket.seatLabel)}</div>
    </div></div>`).join("")}</section>`).join("")}<script>${printMode === "pdf" || printMode === "print" ? "window.onload = () => { window.focus(); window.print(); };" : ""}</script></body></html>`;
  }


  function getCompTicketPrintRows(scope: CompTicketPrintScope) {
    return buildCompListReportRows().filter((row) => {
      if (scope === "sponsor") return row.category === "sponsor";
      if (scope === "non_sponsor") return row.category !== "sponsor";
      if (scope.startsWith("category:")) return row.category === scope.slice("category:".length);
      if (scope.startsWith("row:")) return row.id === scope.slice("row:".length);
      return true;
    });
  }

  function buildCompTicketPrintHtml({ printMode, scope }: { printMode: "print" | "pdf"; scope: CompTicketPrintScope }) {
    const rows = getCompTicketPrintRows(scope);
    if (!show || rows.length === 0) return null;

    const needsSponsorTemplate = rows.some((row) => row.category === "sponsor");
    const needsGeneralTemplate = rows.some((row) => row.category !== "sponsor");
    if ((needsSponsorTemplate && !activeSponsorTicketTemplateUrl) || (needsGeneralTemplate && !activeGeneralTicketTemplateUrl)) return null;

    const tickets = rows.flatMap((row) => {
      const seats = row.admissionType === "general_admission"
        ? []
        : row.reservedSeats
          ? row.reservedSeats.split(",").map((seat) => seat.trim()).filter(Boolean)
          : [];
      const count = Math.max(row.quantity, row.admissionType === "general_admission" ? 0 : seats.length, 1);
      const templateUrl = row.category === "sponsor" ? activeSponsorTicketTemplateUrl : activeGeneralTicketTemplateUrl;
      return Array.from({ length: count }, (_, index) => ({
        name: row.name,
        categoryLabel: row.categoryLabel,
        seatLabel: row.admissionType === "general_admission" ? "GENERAL ADMISSION" : seats[index] ?? "Comp",
        stubSeatLabel: row.admissionType === "general_admission" ? "GA" : seats[index] ?? "Comp",
        ticketNumber: `${index + 1} of ${count}`,
        totalForReservation: count,
        templateUrl: templateUrl!,
        isSponsorTicket: row.category === "sponsor",
      }));
    });
    const ticketSheets = Array.from({ length: Math.ceil(tickets.length / 4) }, (_, sheetIndex) => tickets.slice(sheetIndex * 4, sheetIndex * 4 + 4));
    const showDate = formatShowDate(show.show_date);
    const doorsTime = show.guest_arrival_time || "6:00 PM";
    const showTime = show.show_start_time || "TBD";

    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(show.name)} Comp Tickets</title><style>
      @page { size: 8.5in 11in portrait; margin: .18in; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #111; font-family: Arial, Helvetica, sans-serif; }
      .ticket-sheet { width: 8.14in; height: 10.64in; display: grid; grid-template-columns: 5.26in; grid-template-rows: repeat(4, 2.55in); gap: .08in; align-content: center; justify-content: center; page-break-after: always; overflow: hidden; background: #fff; }
      .ticket-slot { width: 5.26in; height: 2.55in; overflow: hidden; position: relative; background: #000; }
      .ticket-page { width: 11in; height: 5.33in; position: absolute; left: 0; top: 0; overflow: hidden; background: #000; transform: scale(.478); transform-origin: top left; }
      .ticket-page img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .field { position: absolute; color: #14110d; font-weight: 800; letter-spacing: 0.02em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sponsor { left: 1.15in; top: 2.69in; width: 3.05in; font-size: .17in; }
      .event { left: 1.34in; top: 3.15in; width: 2.9in; font-size: .125in; letter-spacing: 0; text-overflow: clip; }
      .date { left: 5.25in; top: 3.15in; width: 1.82in; font-size: .15in; }
      .doors-main { left: .88in; top: 3.62in; width: 1.15in; text-align: center; font-size: .15in; }
      .time { left: 3.06in; top: 3.62in; width: 1.15in; text-align: center; font-size: .15in; }
      .count { left: 5.78in; top: 3.62in; width: 1.18in; text-align: center; font-size: .17in; }
      .seat-main { left: 1.58in; top: 4.09in; width: 5.5in; font-size: .18in; }
      .stub-count { left: 8.88in; top: 2.34in; width: 1.58in; height: .42in; display: flex; align-items: center; justify-content: center; text-align: center; color: #17120e; font-size: .34in; font-weight: 900; letter-spacing: 0; line-height: 1; white-space: nowrap; overflow: visible; text-overflow: clip; }
      .stub-seat { left: 8.72in; top: 3.39in; width: 1.87in; text-align: center; color: #2d2721; font-size: .3in; font-weight: 900; }
      .general-ticket .sponsor,
      .general-ticket .event,
      .general-ticket .date,
      .general-ticket .doors-main,
      .general-ticket .time,
      .general-ticket .count,
      .general-ticket .seat-main { transform: translateY(.045in); }
      .general-ticket .stub-seat { transform: translateY(.035in); }
      @media print { body { background: #fff; } .ticket-sheet { break-after: page; } .ticket-sheet:last-child { break-after: auto; } }
    </style></head><body>${ticketSheets.map((sheet) => `<section class="ticket-sheet">${sheet.map((ticket) => `<div class="ticket-slot"><div class="ticket-page ${ticket.isSponsorTicket ? "" : "general-ticket"}"><img src="${ticket.templateUrl}" alt="" />
      <div class="field sponsor">${escapeHtml(ticket.name)}</div>
      <div class="field event">${escapeHtml(show.name)}</div>
      <div class="field date">${escapeHtml(showDate)}</div>
      <div class="field doors-main">${escapeHtml(doorsTime)}</div>
      <div class="field time">${escapeHtml(showTime)}</div>
      <div class="field count">${escapeHtml(String(ticket.totalForReservation))}</div>
      <div class="field seat-main">${escapeHtml(`${ticket.categoryLabel} - ${ticket.seatLabel}`)}</div>
      <div class="field stub-count">${escapeHtml(ticket.ticketNumber)}</div>
      <div class="field stub-seat">${escapeHtml(ticket.stubSeatLabel)}</div>
    </div></div>`).join("")}</section>`).join("")}<script>${printMode === "pdf" || printMode === "print" ? "window.onload = () => { window.focus(); window.print(); };" : ""}</script></body></html>`;
  }

  function buildGeneralAdmissionTicketPrintHtml(printMode: "print" | "pdf") {
    if (!show || !activeGeneralAdmissionTicketTemplateUrl) return null;
    const quantity = Math.max(1, Number.parseInt(generalAdmissionTicketFormState.quantity, 10) || 1);
    const startNumber = Number.parseInt(generalAdmissionTicketFormState.ticketStartNumber, 10);
    const shouldShowTicketNumber = generalAdmissionTicketFormState.ticketPrefix.trim() || Number.isFinite(startNumber);
    const firstNumber = Number.isFinite(startNumber) ? startNumber : 1;
    const tickets = Array.from({ length: quantity }, (_, index) => ({
      ticketNumber: shouldShowTicketNumber ? `${generalAdmissionTicketFormState.ticketPrefix.trim()}${firstNumber + index}` : "",
    }));
    const ticketSheets = Array.from({ length: Math.ceil(tickets.length / 4) }, (_, sheetIndex) => tickets.slice(sheetIndex * 4, sheetIndex * 4 + 4));
    const showEvent = generalAdmissionTicketFormState.showEvent.trim() || show.name || "Cumberland Mountain Music Show";
    const showDate = generalAdmissionTicketFormState.showDate.trim() || formatShowDate(show.show_date);
    const doorsTime = generalAdmissionTicketFormState.doorsTime.trim() || show.guest_arrival_time || "6:00 PM";
    const showTime = generalAdmissionTicketFormState.showTime.trim() || show.show_start_time || "TBD";

    const GA_LAYOUT = {
      showEvent: { left: "1.28in", top: "2.91in", width: "2.86in", height: ".32in", fontSize: ".138in", textAlign: "center" },
      showDate: { left: "5.22in", top: "2.91in", width: "1.85in", height: ".32in", fontSize: ".175in", textAlign: "center" },
      doors: { left: ".80in", top: "3.36in", width: "1.18in", height: ".30in", fontSize: ".175in", textAlign: "center" },
      showTime: { left: "3.02in", top: "3.36in", width: "1.17in", height: ".30in", fontSize: ".175in", textAlign: "center" },
      numberOfTickets: { left: "5.77in", top: "3.39in", width: "1.20in", height: ".33in", fontSize: ".21in", textAlign: "center", letterSpacing: ".04em" },
      reservedSeats: { left: "1.50in", top: "3.79in", width: "5.55in", height: ".36in", fontSize: ".29in", textAlign: "left", letterSpacing: ".07em" },
      stubTicketNumber: { left: "8.63in", top: "1.29in", width: "1.92in", height: ".26in", fontSize: ".19in", textAlign: "center", color: "#f4eadf" },
      stubSeat: { left: "8.72in", top: "3.08in", width: "1.86in", height: ".56in", fontSize: ".26in", textAlign: "center", letterSpacing: ".05em" },
    };
    const gaStyle = (field: keyof typeof GA_LAYOUT) => {
      const layout = GA_LAYOUT[field];
      const justifyContent = layout.textAlign === "center" ? "center" : layout.textAlign === "right" ? "flex-end" : "flex-start";
      return `left:${layout.left};top:${layout.top};width:${layout.width};height:${layout.height};font-size:${layout.fontSize};text-align:${layout.textAlign};display:flex;align-items:center;justify-content:${justifyContent};${"letterSpacing" in layout ? `letter-spacing:${layout.letterSpacing};` : ""}${"color" in layout ? `color:${layout.color};` : ""}`;
    };

    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(show.name)} General Admission Tickets</title><style>
      @page { size: 8.5in 11in portrait; margin: .18in; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #111; font-family: Arial, Helvetica, sans-serif; }
      .ticket-sheet { width: 8.14in; height: 10.64in; display: grid; grid-template-columns: 5.26in; grid-template-rows: repeat(4, 2.34in); gap: .08in; align-content: center; justify-content: center; page-break-after: always; overflow: hidden; background: #fff; }
      .ticket-slot { width: 5.26in; height: 2.34in; overflow: hidden; position: relative; background: #000; }
      .ga-ticket-page { width: 11in; height: 4.885in; position: absolute; left: 0; top: 0; overflow: hidden; background: #000; transform: scale(.478); transform-origin: top left; }
      .ga-ticket-page img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .ga-field { position: absolute; color: #14110d; font-weight: 900; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: clip; }
      @media print { body { background: #fff; } .ticket-sheet { break-after: page; } .ticket-sheet:last-child { break-after: auto; } }
    </style></head><body>${ticketSheets.map((sheet) => `<section class="ticket-sheet">${sheet.map((ticket) => `<div class="ticket-slot"><div class="ga-ticket-page"><img src="${activeGeneralAdmissionTicketTemplateUrl}" alt="" />
      <div class="ga-field" style="${gaStyle("showEvent")}">${escapeHtml(showEvent)}</div>
      <div class="ga-field" style="${gaStyle("showDate")}">${escapeHtml(showDate)}</div>
      <div class="ga-field" style="${gaStyle("doors")}">${escapeHtml(doorsTime)}</div>
      <div class="ga-field" style="${gaStyle("showTime")}">${escapeHtml(showTime)}</div>
      <div class="ga-field" style="${gaStyle("numberOfTickets")}">SINGLE</div>
      <div class="ga-field" style="${gaStyle("reservedSeats")}">GENERAL</div>
      ${ticket.ticketNumber ? `<div class="ga-field" style="${gaStyle("stubTicketNumber")}">${escapeHtml(ticket.ticketNumber)}</div>` : ""}
      <div class="ga-field" style="${gaStyle("stubSeat")}">GENERAL</div>
    </div></div>`).join("")}</section>`).join("")}<script>${printMode === "pdf" || printMode === "print" ? "window.onload = () => { window.focus(); window.print(); };" : ""}</script></body></html>`;
  }
  return {
    buildCompListReportRows,
    buildSponsorCompListPrintHtml,
    buildSponsorTicketPrintHtml,
    buildCompTicketPrintHtml,
    buildGeneralAdmissionTicketPrintHtml,
    getCompTicketPrintRows,
    getCompAdmissionTypeLabel,
    classifyCompTicket,
  };
}

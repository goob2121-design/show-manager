"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "@/app/components/admin-gate";
import { AdminQuickNav } from "@/app/components/admin-quick-nav";
import { buildShowTimelineMessages } from "@/lib/show-reminders";
import { RESERVED_SEAT_DEFINITIONS } from "@/lib/reserved-seating";
import { createClient } from "@/lib/supabase/client";
import type { GuestProfile, SetlistEntry, ShowCompTicket, ShowFinanceItem, ShowGuestSong, ShowRecord, ShowReservedSeatingLink } from "@/lib/types";

type SetlistEntryRow = SetlistEntry & {
  guest_song?: ShowGuestSong | ShowGuestSong[] | null;
};

type ShowFormState = {
  name: string;
  showDate: string;
  venue: string;
  slug: string;
};

type DashboardSection = "active" | "create" | "archived";
type MainDashboardPanel = "quickActions" | "showSnapshot" | "yearlyFinanceSummary" | "dashboard";

type PrefillSource = "" | string;
type CopyLinkRole = "guest" | "band" | "admin" | "mc";
type CopyMenuDirection = "up" | "down";

type CurrentShowDashboardMetrics = {
  onlineTicketsSold: number;
  reservedSeatsAssigned: number;
  reservedSeatCapacity: number | null;
  sponsorCompTicketsIssued: number;
  sponsorRecordsCount: number;
  reservedSeatLinksCount: number;
  guestSongs: ShowGuestSong[];
  guestProfiles: GuestProfile[];
  setlistEntries: Array<Pick<SetlistEntry, "id" | "guest_song_id" | "section">>;
};

function DashboardIcon({
  children,
  className = "h-4 w-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-[#c89b3c] ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

function MusicNoteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12.5 3.5v8.25a2.5 2.5 0 1 1-1.5-2.28V5.2l5-1.2v6.55a2.5 2.5 0 1 1-1.5-2.28V3.5l-2 .48Z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="6.5" />
      <path d="m7.25 10.25 1.75 1.75 3.75-4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 5.5h8M6.5 10h8M6.5 14.5h8M4 5.5h.01M4 10h.01M4 14.5h.01" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4.5" width="13" height="11.5" rx="1.5" />
      <path d="M6.5 2.75v3.5M13.5 2.75v3.5M3.5 8h13" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 16.25s4.25-4.16 4.25-7.25a4.25 4.25 0 1 0-8.5 0c0 3.09 4.25 7.25 4.25 7.25Z" />
      <circle cx="10" cy="8.75" r="1.5" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.5 5 16.5M15 3.5l-2 13M4 7.5h12M3 12.5h12" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="2.75" width="6" height="9" rx="3" />
      <path d="M5.5 9.5a4.5 4.5 0 0 0 9 0M10 14v3.25M7 17.25h6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 2.75 15.75 5v4.8c0 3.7-2.25 6.05-5.75 7.45C6.5 15.85 4.25 13.5 4.25 9.8V5L10 2.75Z" />
    </svg>
  );
}

function DoorModeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 17.25h11M6.25 17.25V3.75h7.5v13.5M11.5 10h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="5" width="8.5" height="10.5" rx="1.5" />
      <path d="M4.5 12V4.5A1.5 1.5 0 0 1 6 3h6.5" />
    </svg>
  );
}

const initialFormState: ShowFormState = {
  name: "",
  showDate: "",
  venue: "",
  slug: "",
};

const dashboardPanelStorageKey = "stageflow-admin-dashboard-panels";
const dashboardCopyLinksStorageKey = "stageflow-dashboard-copy-links-expanded";
const defaultMainDashboardPanels: Record<MainDashboardPanel, boolean> = {
  quickActions: true,
  showSnapshot: true,
  yearlyFinanceSummary: true,
  dashboard: true,
};
const defaultDashboardSections: Record<DashboardSection, boolean> = {
  active: false,
  create: false,
  archived: false,
};

const dashboardSections: Array<{
  id: DashboardSection;
  label: string;
  description: string;
}> = [
  {
    id: "active",
    label: "Active Shows",
    description: "Open portals, update details, and manage the current lineup.",
  },
  {
    id: "create",
    label: "Create Show",
    description: "Spin up a new show record and jump directly into setup.",
  },
  {
    id: "archived",
    label: "Archived Shows",
    description: "Restore older shows safely without losing related show data.",
  },
];

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${showDate}T00:00:00`));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatProfitMargin(income: number, net: number) {
  if (income <= 0) {
    return "N/A";
  }

  return `${((net / income) * 100).toFixed(1)}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getShowYear(showDate: string | null) {
  if (!showDate) {
    return null;
  }

  const parsedDate = new Date(`${showDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getUTCFullYear();
}

function normalizeFinanceAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  return 0;
}

type FinanceQuickTotalDefinition = {
  key: string;
  label: string;
  type: ShowFinanceItem["type"];
  matchers: string[];
};

const financeQuickTotalDefinitions: FinanceQuickTotalDefinition[] = [
  {
    key: "sponsorship-income",
    label: "Sponsorship Income",
    type: "income",
    matchers: ["sponsor", "sponsorship"],
  },
  {
    key: "presale-ticket-income",
    label: "Presale Ticket Income",
    type: "income",
    matchers: ["presale", "pre-sale", "advance ticket", "advance sales"],
  },
  {
    key: "door-sales-income",
    label: "Door Sales Income",
    type: "income",
    matchers: ["door", "door sales", "ticket sales", "walk-up"],
  },
  {
    key: "advertising-expenses",
    label: "Advertising Expenses",
    type: "expense",
    matchers: ["advertis", "marketing", "promo", "facebook ad"],
  },
  {
    key: "talent-guest-pay",
    label: "Talent / Guest Pay",
    type: "expense",
    matchers: ["guest pay", "talent", "artist pay", "performer pay"],
  },
  {
    key: "band-pay",
    label: "Band Pay",
    type: "expense",
    matchers: ["band pay", "band"],
  },
  {
    key: "printing-signs",
    label: "Printing / Signs",
    type: "expense",
    matchers: ["print", "printing", "sign", "signage"],
  },
  {
    key: "misc-expenses",
    label: "Misc Expenses",
    type: "expense",
    matchers: ["misc", "miscellaneous", "other"],
  },
];

function normalizeFinanceCategoryLabel(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function openPrintDocumentWindow(printHtml: string) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    window.alert("The print window was blocked. Please allow pop-ups and try again.");
    return false;
  }

  const triggerPrint = () => {
    if (printWindow.closed) {
      return;
    }

    printWindow.focus();
    printWindow.print();
  };

  const triggerPrintWhenReady = () => {
    const { document } = printWindow;
    const images = Array.from(document.images ?? []);

    if (images.length === 0) {
      window.setTimeout(triggerPrint, 150);
      return;
    }

    let settledImages = 0;
    const finishImageLoad = () => {
      settledImages += 1;

      if (settledImages >= images.length) {
        window.setTimeout(triggerPrint, 150);
      }
    };

    images.forEach((image) => {
      if (image.complete) {
        finishImageLoad();
        return;
      }

      image.addEventListener("load", finishImageLoad, { once: true });
      image.addEventListener("error", finishImageLoad, { once: true });
    });
  };

  printWindow.onload = triggerPrintWhenReady;
  printWindow.onafterprint = () => {
    printWindow.close();
  };

  const { document } = printWindow;
  document.open();
  document.write(printHtml);
  document.close();

  if (document.readyState === "complete") {
    triggerPrintWhenReady();
  }

  return true;
}

type YearlyFinanceReportShowBreakdown = {
  show: ShowRecord;
  income: number;
  expenses: number;
  net: number;
};

type YearlyFinanceReportCategoryGroup = {
  category: string;
  total: number;
  items: Array<
    ShowFinanceItem & {
      showName: string;
      showDate: string | null;
    }
  >;
};

type YearlyFinanceReportQuickTotal = {
  key: string;
  label: string;
  amount: number;
};

function buildYearToDateFinanceReportHtml({
  year,
  showCount,
  totalIncome,
  totalExpenses,
  net,
  quickTotals,
  showBreakdown,
  incomeGroups,
  expenseGroups,
  logoUrl,
}: {
  year: number;
  showCount: number;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  quickTotals: YearlyFinanceReportQuickTotal[];
  showBreakdown: YearlyFinanceReportShowBreakdown[];
  incomeGroups: YearlyFinanceReportCategoryGroup[];
  expenseGroups: YearlyFinanceReportCategoryGroup[];
  logoUrl: string;
}) {
  const summaryRows = [
    { label: "Year", value: String(year), tone: "tone-neutral" },
    {
      label: "Prepared",
      value: new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
      tone: "tone-neutral",
    },
    { label: "Total Income", value: formatCurrency(totalIncome), tone: "tone-income" },
    { label: "Total Expenses", value: formatCurrency(totalExpenses), tone: "tone-expense" },
    {
      label: "Net Profit / Loss",
      value: formatCurrency(net),
      tone: net < 0 ? "tone-net-negative" : "tone-net-positive",
    },
    {
      label: "Profit Margin",
      value: formatProfitMargin(totalIncome, net),
      tone: totalIncome > 0 && net < 0 ? "tone-net-negative" : "tone-neutral",
    },
    { label: "Total Shows Included", value: String(showCount), tone: "tone-neutral" },
  ];

  const renderCategoryGroups = (
    groups: YearlyFinanceReportCategoryGroup[],
    emptyMessage: string,
    toneClass: string,
  ) => {
    if (groups.length === 0) {
      return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    }

    return groups
      .map(
        (group) => `
          <section class="category-group avoid-break ${toneClass}">
            <div class="category-header">
              <div>
                <h3>${escapeHtml(group.category)}</h3>
                <p>${group.items.length} item${group.items.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div class="line-items">
              ${group.items
                .map(
                  (item) => `
                    <div class="line-item avoid-break">
                      <div class="line-item-main">
                        <div class="line-item-top">
                          <strong>${escapeHtml(item.label || "Untitled item")}</strong>
                          <span class="${toneClass}">${escapeHtml(formatCurrency(item.amount))}</span>
                        </div>
                        <p>${escapeHtml(item.showName)}${
                          item.showDate ? ` • ${escapeHtml(formatShowDate(item.showDate))}` : ""
                        }</p>
                        ${
                          item.notes?.trim()
                            ? `<p class="line-item-notes">${escapeHtml(item.notes.trim())}</p>`
                            : ""
                        }
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <div class="category-total-row ${toneClass}">
              <span>${escapeHtml(group.category)} Total</span>
              <strong>${escapeHtml(formatCurrency(group.total))}</strong>
            </div>
          </section>
        `,
      )
      .join("");
  };

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(`Year-to-Date Finance Report — ${year}`)}</title>
      <style>
        :root {
          color-scheme: light;
        }
        * {
          box-sizing: border-box;
        }
        @page {
          margin: 0.55in;
        }
        body {
          margin: 0;
          background: #ffffff;
          color: #111827;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.42;
        }
        .report {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .page-break {
          break-before: page;
          page-break-before: always;
        }
        .logo {
          display: block;
          width: auto;
          max-width: 280px;
          max-height: 90px;
          margin: 0 auto 0.75rem;
          object-fit: contain;
        }
        .header {
          text-align: center;
          border-bottom: 1.5px solid #a8a29e;
          padding-bottom: 0.65rem;
          margin-bottom: 0.8rem;
        }
        .header h1 {
          margin: 0.25rem 0 0;
          font-size: 1.7rem;
          line-height: 1.15;
        }
        .header p {
          margin: 0.35rem 0 0;
          color: #57534e;
          font-size: 0.96rem;
        }
        .summary-intro {
          margin: 0 0 0.8rem;
          color: #44403c;
          font-size: 0.94rem;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.25rem 1.25rem;
          border-top: 1px solid #d6d3d1;
          border-bottom: 1px solid #d6d3d1;
          padding: 0.2rem 0 0.35rem;
        }
        .summary-card {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.45rem 0;
          border-bottom: 1px solid #ece7e1;
          background: transparent;
        }
        .summary-card:nth-last-child(-n + 2) {
          border-bottom: none;
        }
        .summary-card span {
          display: block;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #57534e;
        }
        .summary-card strong {
          display: block;
          font-size: 1rem;
          color: #111827;
          text-align: right;
        }
        .quick-totals {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.15rem 1rem;
        }
        .quick-total {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.35rem 0;
          border-bottom: 1px solid #ece7e1;
          font-size: 0.92rem;
        }
        .section-title {
          margin: 1.25rem 0 0.7rem;
          padding-bottom: 0.3rem;
          border-bottom: 1px solid #d6d3d1;
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #111827;
        }
        .section-title:first-child {
          margin-top: 0;
        }
        .subtle {
          margin: 0 0 0.8rem;
          color: #57534e;
          font-size: 0.9rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 0.55rem 0.5rem;
          border-bottom: 1px solid #e7e5e4;
          text-align: left;
          vertical-align: top;
          font-size: 0.92rem;
        }
        th {
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #57534e;
          border-bottom: 1.5px solid #a8a29e;
          background: #fafaf9;
        }
        td.amount, th.amount {
          text-align: right;
          white-space: nowrap;
        }
        tbody tr:nth-child(even) {
          background: #fafaf9;
        }
        .show-row td.amount.income {
          color: #166534;
          font-weight: 600;
        }
        .show-row td.amount.expense {
          color: #b91c1c;
          font-weight: 600;
        }
        .show-row td.amount.net-positive {
          color: #166534;
          font-weight: 700;
        }
        .show-row td.amount.net-negative {
          color: #b91c1c;
          font-weight: 700;
        }
        .category-group {
          padding: 0 0 0.95rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #d6d3d1;
        }
        .category-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          border-bottom: 1px solid #e7e5e4;
          padding-bottom: 0.5rem;
          margin-bottom: 0.65rem;
        }
        .category-header h3 {
          margin: 0;
          font-size: 1.08rem;
          font-weight: 800;
          line-height: 1.25;
          color: #111827;
        }
        .category-header p {
          margin: 0.18rem 0 0;
          color: #57534e;
          font-size: 0.8rem;
        }
        .category-header strong {
          font-size: 1rem;
          white-space: nowrap;
        }
        .tone-income {
          color: #166534;
        }
        .tone-expense {
          color: #b91c1c;
        }
        .tone-net-positive {
          color: #166534;
        }
        .tone-net-negative {
          color: #b91c1c;
        }
        .tone-neutral {
          color: #111827;
        }
        .line-items {
          display: grid;
          gap: 0.15rem;
        }
        .line-item {
          padding: 0.45rem 0;
          border-bottom: 1px solid #f1eeea;
        }
        .line-item-top {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }
        .line-item-top strong {
          font-size: 0.95rem;
        }
        .line-item-top span {
          white-space: nowrap;
          font-weight: 700;
        }
        .line-item-main p {
          margin: 0.25rem 0 0;
          color: #57534e;
          font-size: 0.84rem;
        }
        .line-item-notes {
          color: #44403c;
          font-size: 0.8rem;
        }
        .category-total-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: baseline;
          margin-top: 0.6rem;
          padding-top: 0.55rem;
          border-top: 1px solid #d6d3d1;
          font-size: 0.94rem;
          font-weight: 700;
        }
        .category-total-row strong {
          white-space: nowrap;
        }
        .empty-state {
          border: 1px dashed #d6d3d1;
          border-radius: 10px;
          padding: 1rem;
          color: #57534e;
          background: #ffffff;
          font-size: 0.92rem;
        }
        .final-summary {
          margin-top: 0.45rem;
          padding-top: 0.8rem;
          border-top: 1.5px solid #a8a29e;
        }
        .avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <main class="report">
        <section class="avoid-break">
          <img src="${escapeHtml(logoUrl)}" alt="Cumberland Mountain Music Show logo" class="logo" />
          <div class="header">
            <h1>Year-to-Date Finance Report</h1>
            <p>${escapeHtml(String(year))} Cumberland Mountain Music Show Summary</p>
          </div>
          <p class="summary-intro">Executive Summary / Year Summary</p>
          <div class="summary-grid">
            ${summaryRows
              .map(
                (row) => `
                  <div class="summary-card avoid-break">
                    <span>${escapeHtml(row.label)}</span>
                    <strong class="${escapeHtml(row.tone)}">${escapeHtml(row.value)}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
          ${
            quickTotals.length > 0
              ? `
                <h2 class="section-title" style="margin-top: 1rem;">Quick Totals</h2>
                <div class="quick-totals">
                  ${quickTotals
                    .map(
                      (item) => `
                        <div class="quick-total avoid-break">
                          <span>${escapeHtml(item.label)}</span>
                          <strong>${escapeHtml(formatCurrency(item.amount))}</strong>
                        </div>
                      `,
                    )
                    .join("")}
                </div>
              `
              : ""
          }
        </section>

        <section class="page-break">
          <h2 class="section-title">Show-By-Show Summary</h2>
          <p class="subtle">All shows dated in ${escapeHtml(String(year))}, including archived and historical records.</p>
          ${
            showBreakdown.length === 0
              ? `<div class="empty-state">No shows with dates were found for ${escapeHtml(String(year))}.</div>`
              : `
                <table>
                  <thead>
                    <tr>
                      <th>Show</th>
                      <th>Date</th>
                      <th class="amount">Income</th>
                      <th class="amount">Expenses</th>
                      <th class="amount">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${showBreakdown
                      .map(
                        ({ show, income, expenses, net }) => `
                          <tr class="avoid-break show-row">
                            <td>${escapeHtml(show.name)}</td>
                            <td>${escapeHtml(formatShowDate(show.show_date))}</td>
                            <td class="amount income">${escapeHtml(formatCurrency(income))}</td>
                            <td class="amount expense">${escapeHtml(formatCurrency(expenses))}</td>
                            <td class="amount ${net < 0 ? "net-negative" : "net-positive"}">${escapeHtml(formatCurrency(net))}</td>
                          </tr>
                        `,
                      )
                      .join("")}
                  </tbody>
                </table>
              `
          }
        </section>

        <section class="page-break">
          <h2 class="section-title">Income Breakdown</h2>
          <p class="subtle">Grouped income items for all shows in ${escapeHtml(String(year))}.</p>
          ${renderCategoryGroups(incomeGroups, `No income items were found for ${year}.`, "tone-income")}
        </section>

        <section class="page-break">
          <h2 class="section-title">Expense Breakdown</h2>
          <p class="subtle">Grouped expense items for all shows in ${escapeHtml(String(year))}.</p>
          ${renderCategoryGroups(expenseGroups, `No expense items were found for ${year}.`, "tone-expense")}
          <section class="final-summary avoid-break">
            <h2 class="section-title">Final Totals</h2>
            <div class="summary-grid">
              ${[
                { label: "Total Income", value: formatCurrency(totalIncome), tone: "tone-income" },
                { label: "Total Expenses", value: formatCurrency(totalExpenses), tone: "tone-expense" },
                {
                  label: "Net Profit / Loss",
                  value: formatCurrency(net),
                  tone: net < 0 ? "tone-net-negative" : "tone-net-positive",
                },
                {
                  label: "Profit Margin",
                  value: formatProfitMargin(totalIncome, net),
                  tone: totalIncome > 0 && net < 0 ? "tone-net-negative" : "tone-neutral",
                },
              ]
                .map(
                  (row) => `
                    <div class="summary-card avoid-break">
                      <span>${escapeHtml(row.label)}</span>
                      <strong class="${escapeHtml(row.tone)}">${escapeHtml(row.value)}</strong>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </section>
        </section>
      </main>
    </body>
  </html>`;
}

function normalizeShowFinanceItem(item: Partial<ShowFinanceItem> & { amount?: unknown }) {
  return {
    id: item.id ?? "",
    show_id: item.show_id ?? "",
    type: item.type === "expense" ? "expense" : "income",
    category: item.category ?? null,
    label: item.label ?? "",
    amount: normalizeFinanceAmount(item.amount),
    notes: item.notes ?? null,
    created_at: item.created_at ?? "",
  } satisfies ShowFinanceItem;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to Supabase.";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildShowFormState(show: Pick<ShowRecord, "name" | "show_date" | "venue" | "slug">) {
  return {
    name: show.name,
    showDate: show.show_date ?? "",
    venue: show.venue ?? "",
    slug: show.slug,
  };
}

function buildDuplicateFormState() {
  return {
    name: "",
    showDate: "",
    venue: "",
    slug: "",
  };
}

function normalizeGuestName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getCurrentShow(shows: ShowRecord[], today: string) {
  const activeShows = shows.filter((show) => !show.is_archived);
  const upcomingShows = activeShows.filter((show) => show.show_date && show.show_date >= today);

  return upcomingShows[0] ?? activeShows[0] ?? null;
}

function getSetlistSectionLabel(section: SetlistEntry["section"]) {
  if (section === "set2") {
    return "Set 2";
  }

  if (section === "encore") {
    return "Encore";
  }

  return "Set 1";
}

function getShowCardTone(isArchived: boolean) {
  if (isArchived) {
    return {
      card: "border-amber-300 bg-amber-50",
      badge: "bg-amber-200 text-amber-900",
      divider: "border-amber-300",
      metaCard: "border-amber-300 bg-white/80",
      status: "Archived",
    };
  }

  return {
    card: "border-stone-200 bg-white",
    badge: "bg-amber-200 text-amber-900",
    divider: "border-stone-200",
    metaCard: "border-stone-200 bg-stone-50",
    status: "Active",
  };
}

const stageflowDashboardVersion = "StageFlow 5.0";

export default function ShowsDashboardPage() {
  const router = useRouter();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [formState, setFormState] = useState<ShowFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [expandedMainPanels, setExpandedMainPanels] = useState<Record<MainDashboardPanel, boolean>>(
    defaultMainDashboardPanels,
  );
  const [expandedDashboardSections, setExpandedDashboardSections] =
    useState<Record<DashboardSection, boolean>>(defaultDashboardSections);
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [editFormState, setEditFormState] = useState<ShowFormState>(initialFormState);
  const [duplicatingShowId, setDuplicatingShowId] = useState<string | null>(null);
  const [duplicateFormState, setDuplicateFormState] = useState<ShowFormState>(
    buildDuplicateFormState(),
  );
  const [activeShowActionId, setActiveShowActionId] = useState<string | null>(null);
  const [expandedShowId, setExpandedShowId] = useState<string | null>(null);
  const [prefillSourceShowId, setPrefillSourceShowId] = useState<PrefillSource>("");
  const [openCopyMenuShowId, setOpenCopyMenuShowId] = useState<string | null>(null);
  const [copyMenuDirection, setCopyMenuDirection] = useState<CopyMenuDirection>("down");
  const [isCopyLinksExpanded, setIsCopyLinksExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(dashboardCopyLinksStorageKey) === "expanded";
    } catch {
      return false;
    }
  });
  const [financeItems, setFinanceItems] = useState<ShowFinanceItem[]>([]);
  const [selectedFinanceYear, setSelectedFinanceYear] = useState(() => new Date().getUTCFullYear());
  const [financeSummaryErrorMessage, setFinanceSummaryErrorMessage] = useState<string | null>(null);
  const [isPrintingYearlyFinanceReport, setIsPrintingYearlyFinanceReport] = useState(false);
  const [currentShowMetrics, setCurrentShowMetrics] = useState<CurrentShowDashboardMetrics>({
    onlineTicketsSold: 0,
    reservedSeatsAssigned: 0,
    reservedSeatCapacity: RESERVED_SEAT_DEFINITIONS.length,
    sponsorCompTicketsIssued: 0,
    sponsorRecordsCount: 0,
    reservedSeatLinksCount: 0,
    guestSongs: [],
    guestProfiles: [],
    setlistEntries: [],
  });

  const activeShows = shows.filter((show) => !show.is_archived);
  const archivedShows = shows.filter((show) => show.is_archived);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingShows = activeShows.filter(
    (show) => show.show_date && show.show_date >= today,
  );
  const currentShow = upcomingShows[0] ?? null;
  const dashboardTimelineMessages = useMemo(
    () => buildShowTimelineMessages(currentShow?.show_date ?? null),
    [currentShow?.show_date],
  );
  const guestSongIdsInSetlist = useMemo(
    () =>
      new Set(
        currentShowMetrics.setlistEntries
          .map((entry) => entry.guest_song_id)
          .filter((songId): songId is string => Boolean(songId)),
      ),
    [currentShowMetrics.setlistEntries],
  );
  const guestsMissingPhotos = currentShowMetrics.guestProfiles.filter(
    (guest) => !guest.photo_url?.trim(),
  );
  const pendingGuestSongs = currentShowMetrics.guestSongs.filter(
    (song) => !guestSongIdsInSetlist.has(song.id),
  );
  const guestsWithoutSongs = currentShowMetrics.guestProfiles.filter((guest) => {
    const guestName = normalizeGuestName(guest.name);

    if (!guestName) {
      return true;
    }

    return !currentShowMetrics.guestSongs.some(
      (song) => normalizeGuestName(song.submitted_by_name) === guestName,
    );
  });
  const needsAttentionItems = [
    ...guestsMissingPhotos.slice(0, 4).map((guest) => ({
      title: `${guest.name || "Unnamed guest"} needs a promo photo`,
      detail: "Add a photo in the guest profile before promo materials go out.",
    })),
    ...guestsWithoutSongs.slice(0, 4).map((guest) => ({
      title: `${guest.name || "Unnamed guest"} has no submitted songs`,
      detail: "Guest songs can be submitted through the guest portal or reviewed in admin.",
    })),
    ...(pendingGuestSongs.length > 0
      ? [
          {
            title: `${pendingGuestSongs.length} guest song${
              pendingGuestSongs.length === 1 ? "" : "s"
            } pending review`,
            detail: "Review guest-submitted songs and add the final choices to the setlist.",
          },
        ]
      : []),
  ].slice(0, 6);
  const nextShowSetlistTotal = currentShowMetrics.setlistEntries.length;
  const showProgressItems = currentShow
    ? [
        {
          label: "Event configured",
          complete: Boolean(currentShow.name?.trim() && currentShow.show_date && currentShow.venue?.trim()),
          href: `/admin/${currentShow.slug}`,
        },
        {
          label: "Guest artist assigned",
          complete: currentShowMetrics.guestProfiles.length > 0,
          href: `/admin/${currentShow.slug}?tab=guests`,
        },
        {
          label: "Tickets on sale",
          complete: Boolean(currentShow.ticket_link?.trim() || currentShow.square_catalog_variation_id?.trim()),
          href: `/admin/${currentShow.slug}?tab=details`,
        },
        {
          label: "Band set list started",
          complete: nextShowSetlistTotal > 0,
          href: `/admin/${currentShow.slug}?tab=setlist`,
        },
        {
          label: "MC script started",
          complete: [
            currentShow.opening_script,
            currentShow.intermission_script,
            currentShow.closing_script,
          ].some((value) => Boolean(value?.trim())),
          href: `/admin/${currentShow.slug}?tab=mc`,
        },
        {
          label: "Sponsor / comp records added",
          complete: currentShowMetrics.sponsorRecordsCount > 0 || currentShowMetrics.sponsorCompTicketsIssued > 0,
          href: `/admin/${currentShow.slug}?tab=tickets`,
        },
        {
          label: "Reserved seats assigned",
          complete: currentShowMetrics.reservedSeatsAssigned > 0,
          href: `/admin/${currentShow.slug}?tab=tickets`,
        },
      ]
    : [];
  const availableFinanceYears = useMemo(() => {
    const years = new Set<number>([new Date().getUTCFullYear()]);

    shows.forEach((show) => {
      const showYear = getShowYear(show.show_date);

      if (showYear !== null) {
        years.add(showYear);
      }
    });

    return Array.from(years).sort((left, right) => right - left);
  }, [shows]);
  const selectedYearShows = useMemo(
    () => shows.filter((show) => getShowYear(show.show_date) === selectedFinanceYear),
    [selectedFinanceYear, shows],
  );
  const yearlyFinanceSummary = useMemo(() => {
    const itemsByShowId = new Map<string, ShowFinanceItem[]>();
    const selectedYearShowLookup = new Map(selectedYearShows.map((show) => [show.id, show]));

    financeItems.forEach((item) => {
      const currentItems = itemsByShowId.get(item.show_id) ?? [];
      currentItems.push(item);
      itemsByShowId.set(item.show_id, currentItems);
    });

    const showBreakdown = selectedYearShows.map((show) => {
      const showItems = itemsByShowId.get(show.id) ?? [];
      const income = showItems
        .filter((item) => item.type === "income")
        .reduce((total, item) => total + item.amount, 0);
      const expenses = showItems
        .filter((item) => item.type === "expense")
        .reduce((total, item) => total + item.amount, 0);

      return {
        show,
        income,
        expenses,
        net: income - expenses,
      };
    });
    const totalIncome = showBreakdown.reduce((total, item) => total + item.income, 0);
    const totalExpenses = showBreakdown.reduce((total, item) => total + item.expenses, 0);
    const net = totalIncome - totalExpenses;
    const selectedYearFinanceItems = financeItems
      .filter((item) => selectedYearShowLookup.has(item.show_id))
      .map((item) => ({
        ...item,
        showName: selectedYearShowLookup.get(item.show_id)?.name ?? "Unknown show",
        showDate: selectedYearShowLookup.get(item.show_id)?.show_date ?? null,
      }));
    const categoryTotals = financeItems.reduce<Record<string, number>>((totals, item) => {
      const matchingShow = selectedYearShows.find((show) => show.id === item.show_id);

      if (!matchingShow || !item.category?.trim()) {
        return totals;
      }

      const key = `${item.type}:${item.category.trim()}`;
      totals[key] = (totals[key] ?? 0) + item.amount;
      return totals;
      }, {});

    const buildCategoryGroups = (type: ShowFinanceItem["type"]) => {
      const groups = selectedYearFinanceItems.reduce<Record<string, YearlyFinanceReportCategoryGroup>>(
        (lookup, item) => {
          if (item.type !== type) {
            return lookup;
          }

          const category = item.category?.trim() || "Uncategorized";
          const existingGroup = lookup[category] ?? {
            category,
            total: 0,
            items: [],
          };

          existingGroup.total += item.amount;
          existingGroup.items.push(item);
          lookup[category] = existingGroup;
          return lookup;
        },
        {},
      );

      return Object.values(groups)
        .map((group) => ({
          ...group,
          items: [...group.items].sort((left, right) => {
            if (left.showDate && right.showDate) {
              return left.showDate.localeCompare(right.showDate);
            }

            if (left.showDate) {
              return -1;
            }

            if (right.showDate) {
              return 1;
            }

            return left.label.localeCompare(right.label);
          }),
        }))
        .sort((left, right) => right.total - left.total);
    };

    const quickTotals = financeQuickTotalDefinitions
      .map((definition) => {
        const amount = selectedYearFinanceItems.reduce((total, item) => {
          if (item.type !== definition.type) {
            return total;
          }

          const categoryLabel = normalizeFinanceCategoryLabel(item.category);
          return definition.matchers.some((matcher) => categoryLabel.includes(matcher))
            ? total + item.amount
            : total;
        }, 0);

        return {
          key: definition.key,
          label: definition.label,
          amount,
        };
      })
      .filter((item) => item.amount > 0);

    return {
      totalIncome,
      totalExpenses,
      net,
      showBreakdown,
      incomeGroups: buildCategoryGroups("income"),
      expenseGroups: buildCategoryGroups("expense"),
      quickTotals,
      categoryTotals: Object.entries(categoryTotals)
        .map(([key, amount]) => {
          const separatorIndex = key.indexOf(":");
          return {
            type: key.slice(0, separatorIndex),
            category: key.slice(separatorIndex + 1),
            amount,
          };
        })
        .sort((left, right) => right.amount - left.amount),
    };
  }, [financeItems, selectedFinanceYear, selectedYearShows]);

  const loadShows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setFinanceSummaryErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .order("show_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const nextShows = (data ?? []) as ShowRecord[];
      const nextCurrentShow =
        nextShows.find((show) => !show.is_archived && show.show_date && show.show_date >= new Date().toISOString().slice(0, 10)) ??
        null;
      const [{ data: financeItemsData, error: financeItemsError }] = await Promise.all([
        supabase.from("show_finance_items").select("*"),
      ]);

      if (financeItemsError) {
        console.error("Failed to load yearly finance summary items.", financeItemsError);
        setFinanceItems([]);
        setFinanceSummaryErrorMessage(getErrorMessage(financeItemsError));
      } else {
        setFinanceItems(
          Array.isArray(financeItemsData)
            ? financeItemsData.map((item) =>
                normalizeShowFinanceItem(item as Partial<ShowFinanceItem> & { amount?: unknown }),
              )
            : [],
        );
      }

      if (!nextCurrentShow) {
        setShows(nextShows);
        setCurrentShowMetrics({
          onlineTicketsSold: 0,
          reservedSeatsAssigned: 0,
          reservedSeatCapacity: RESERVED_SEAT_DEFINITIONS.length,
          sponsorCompTicketsIssued: 0,
          sponsorRecordsCount: 0,
          reservedSeatLinksCount: 0,
          guestSongs: [],
          guestProfiles: [],
          setlistEntries: [],
        });
        return;
      }

      const [
        { data: guestSongs, error: guestSongsError },
        { data: guestProfiles, error: guestProfilesError },
        { data: setlistEntries, error: setlistEntriesError },
        { data: compTickets, error: compTicketsError },
        { count: reservedSeatsAssigned, error: reservedSeatsAssignedError },
        { data: reservedLinks, error: reservedLinksError },
        { count: sponsorRecordsCount, error: sponsorRecordsCountError },
      ] = await Promise.all([
        supabase
          .from("show_guest_songs")
          .select("*")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("guest_profiles")
          .select("*")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("setlist_entries")
          .select("id, guest_song_id, section")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("show_comp_tickets")
          .select("ticket_count, ticket_type")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("show_reserved_seat_assignments")
          .select("id", { count: "exact", head: true })
          .eq("show_id", nextCurrentShow.id)
          .eq("assignment_type", "customer"),
        supabase
          .from("show_reserved_seating_links")
          .select("id, ticket_count, is_complimentary, seat_category")
          .eq("show_id", nextCurrentShow.id),
        supabase
          .from("show_sponsors")
          .select("id", { count: "exact", head: true })
          .eq("show_id", nextCurrentShow.id),
      ]);

      if (guestSongsError) {
        throw guestSongsError;
      }

      if (guestProfilesError) {
        throw guestProfilesError;
      }

      if (setlistEntriesError) {
        throw setlistEntriesError;
      }
      if (compTicketsError) {
        throw compTicketsError;
      }
      if (reservedSeatsAssignedError) {
        throw reservedSeatsAssignedError;
      }
      if (reservedLinksError) {
        throw reservedLinksError;
      }
      if (sponsorRecordsCountError) {
        throw sponsorRecordsCountError;
      }

      const typedCompTickets = (compTickets ?? []) as Array<Pick<ShowCompTicket, "ticket_count" | "ticket_type">>;
      const typedReservedLinks = (reservedLinks ?? []) as Array<
        Pick<ShowReservedSeatingLink, "id" | "ticket_count" | "is_complimentary" | "seat_category">
      >;
      const onlineTicketsSold = typedCompTickets
        .filter((ticket) => ticket.ticket_type === "paid_online")
        .reduce((sum, ticket) => sum + Math.max(0, ticket.ticket_count ?? 0), 0);
      const sponsorCompTicketsIssued = typedCompTickets
        .filter((ticket) => ticket.ticket_type === "complimentary")
        .reduce((sum, ticket) => sum + Math.max(0, ticket.ticket_count ?? 0), 0);

      setShows(nextShows);
      setCurrentShowMetrics({
        onlineTicketsSold,
        reservedSeatsAssigned: reservedSeatsAssigned ?? 0,
        reservedSeatCapacity: RESERVED_SEAT_DEFINITIONS.length,
        sponsorCompTicketsIssued,
        sponsorRecordsCount: sponsorRecordsCount ?? 0,
        reservedSeatLinksCount: typedReservedLinks.length,
        guestSongs: (guestSongs ?? []) as ShowGuestSong[],
        guestProfiles: (guestProfiles ?? []) as GuestProfile[],
        setlistEntries: (setlistEntries ?? []) as Array<Pick<SetlistEntry, "id" | "guest_song_id" | "section">>,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShows();
  }, [loadShows]);

  async function handlePrintYearToDateReport() {
    setFinanceSummaryErrorMessage(null);
    setIsPrintingYearlyFinanceReport(true);

    try {
      const printHtml = buildYearToDateFinanceReportHtml({
        year: selectedFinanceYear,
        showCount: selectedYearShows.length,
        totalIncome: yearlyFinanceSummary.totalIncome,
        totalExpenses: yearlyFinanceSummary.totalExpenses,
        net: yearlyFinanceSummary.net,
        quickTotals: yearlyFinanceSummary.quickTotals,
        showBreakdown: yearlyFinanceSummary.showBreakdown,
        incomeGroups: yearlyFinanceSummary.incomeGroups,
        expenseGroups: yearlyFinanceSummary.expenseGroups,
        logoUrl: `${window.location.origin}/cmms-logo.png`,
      });

      openPrintDocumentWindow(printHtml);
    } catch (error) {
      setFinanceSummaryErrorMessage(getErrorMessage(error));
    } finally {
      setIsPrintingYearlyFinanceReport(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(dashboardPanelStorageKey);

      if (!rawValue) {
        return;
      }

      const parsedValue = JSON.parse(rawValue) as {
        mainPanels?: Partial<Record<MainDashboardPanel, boolean>>;
        dashboardSections?: Partial<Record<DashboardSection, boolean>>;
      };

      if (parsedValue.mainPanels) {
        setExpandedMainPanels((currentPanels) => ({
          ...currentPanels,
          ...parsedValue.mainPanels,
        }));
      }

      if (parsedValue.dashboardSections) {
        setExpandedDashboardSections((currentSections) => ({
          ...currentSections,
          ...parsedValue.dashboardSections,
        }));
      }
    } catch (error) {
      console.error("Failed to restore dashboard panel state.", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        dashboardPanelStorageKey,
        JSON.stringify({
          mainPanels: expandedMainPanels,
          dashboardSections: expandedDashboardSections,
        }),
      );
    } catch (error) {
      console.error("Failed to persist dashboard panel state.", error);
    }
  }, [expandedDashboardSections, expandedMainPanels]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        dashboardCopyLinksStorageKey,
        isCopyLinksExpanded ? "expanded" : "collapsed",
      );
    } catch (error) {
      console.error("Failed to persist dashboard copy-link state.", error);
    }
  }, [isCopyLinksExpanded]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>,
    options?: {
      mode?: "create" | "edit" | "duplicate";
      preserveManualSlug?: boolean;
    },
  ) {
    const { name, value } = event.target;
    const mode = options?.mode ?? "create";
    const preserveManualSlug = options?.preserveManualSlug ?? false;
    const setState =
      mode === "edit"
        ? setEditFormState
        : mode === "duplicate"
          ? setDuplicateFormState
          : setFormState;

    setState((currentState) => {
      if (name === "name") {
        return {
          ...currentState,
          name: value,
          slug:
            preserveManualSlug && currentState.slug
              ? currentState.slug
              : currentState.slug
                ? currentState.slug
                : slugify(value),
        };
      }

      if (name === "slug") {
        return {
          ...currentState,
          slug: slugify(value),
        };
      }

      return {
        ...currentState,
        [name]: value,
      };
    });
  }

  function startEditingShow(show: ShowRecord) {
    setDuplicatingShowId(null);
    setDuplicateFormState(buildDuplicateFormState());
    setEditingShowId(show.id);
    setEditFormState(buildShowFormState(show));
    setErrorMessage(null);
  }

  function cancelEditingShow() {
    setEditingShowId(null);
    setEditFormState(initialFormState);
  }

  function startDuplicatingShow(show: ShowRecord) {
    setEditingShowId(null);
    setEditFormState(initialFormState);
    setDuplicatingShowId(show.id);
    setDuplicateFormState({
      name: "",
      showDate: "",
      venue: show.venue ?? "",
      slug: "",
    });
    setErrorMessage(null);
  }

  function cancelDuplicatingShow() {
    setDuplicatingShowId(null);
    setDuplicateFormState(buildDuplicateFormState());
  }

  function validateShowValues({
    name,
    slug,
    existingShowId,
  }: {
    name: string;
    slug: string;
    existingShowId?: string;
  }) {
    if (!name) {
      return "Show name is required.";
    }

    if (!slug) {
      return "Slug is required.";
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return "Slug must be URL-friendly and use lowercase letters, numbers, and hyphens only.";
    }

    if (shows.some((show) => show.slug === slug && show.id !== existingShowId)) {
      return "A show with that slug already exists.";
    }

    return null;
  }

  function validateDuplicateValues({
    showDate,
    slug,
  }: {
    showDate: string;
    slug: string;
  }) {
    if (!showDate) {
      return "Show date is required when duplicating a show.";
    }

    return validateShowValues({
      name: "temporary-name",
      slug,
    });
  }

  async function handleCopyLink(slug: string, role: CopyLinkRole) {
    const routePath = `/${role}/${slug}`;
    const absoluteUrl =
      typeof window === "undefined" ? routePath : `${window.location.origin}${routePath}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      const nextKey = `${role}-${slug}`;
      setCopiedLinkKey(nextKey);
      setOpenCopyMenuShowId(null);

      window.setTimeout(() => {
        setCopiedLinkKey((currentKey) =>
          currentKey === nextKey ? null : currentKey,
        );
      }, 1800);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function handlePrefillFromExistingShow(event: ChangeEvent<HTMLSelectElement>) {
    const nextShowId = event.target.value;
    setPrefillSourceShowId(nextShowId);

    if (!nextShowId) {
      setFormState(initialFormState);
      return;
    }

    const sourceShow = shows.find((show) => show.id === nextShowId);

    if (!sourceShow) {
      return;
    }

    setFormState({
      name: "",
      showDate: "",
      venue: sourceShow.venue ?? "",
      slug: "",
    });
  }

  function handleToggleCopyMenu(event: MouseEvent<HTMLButtonElement>, showId: string) {
    if (openCopyMenuShowId === showId) {
      setOpenCopyMenuShowId(null);
      return;
    }

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = 196;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    setCopyMenuDirection(
      spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? "up" : "down",
    );
    setOpenCopyMenuShowId(showId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = formState.name.trim();
    const slug = slugify(formState.slug);
    const validationError = validateShowValues({ name, slug });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .insert({
          name,
          slug,
          show_date: formState.showDate || null,
          venue: formState.venue.trim() || null,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      router.push(`/admin/${data.slug}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveShow(event: FormEvent<HTMLFormElement>, showId: string) {
    event.preventDefault();

    const name = editFormState.name.trim();
    const slug = slugify(editFormState.slug);
    const validationError = validateShowValues({ name, slug, existingShowId: showId });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({
          name,
          slug,
          show_date: editFormState.showDate || null,
          venue: editFormState.venue.trim() || null,
        })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );
      cancelEditingShow();
      void loadShows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleSetArchived(showId: string, nextArchivedValue: boolean) {
    setErrorMessage(null);
    setActiveShowActionId(showId);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shows")
        .update({ is_archived: nextArchivedValue })
        .eq("id", showId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setShows((currentShows) =>
        currentShows.map((show) => (show.id === showId ? data : show)),
      );

      if (editingShowId === showId) {
        cancelEditingShow();
      }

      if (duplicatingShowId === showId) {
        cancelDuplicatingShow();
      }

      void loadShows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleDeleteShow(show: ShowRecord) {
    const showDateLabel = formatShowDate(show.show_date);
    const confirmation = window.prompt(
      `Type DELETE to permanently delete "${show.name}" (${showDateLabel}).`,
      "",
    );

    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        setErrorMessage('Show deletion cancelled. Type "DELETE" exactly to confirm.');
      }

      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(show.id);

    try {
      const response = await fetch("/api/shows/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          showId: show.id,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: Array<{ id?: string }>;
        error?: string;
        details?: unknown;
      };

      if (!response.ok || !payload.success) {
        console.error("Failed to delete show.", payload.details ?? payload.error ?? payload);
        throw new Error(payload.error || "Failed to delete show.");
      }

      if (!payload.data || payload.data.length === 0) {
        throw new Error("No show was deleted.");
      }

      setShows((currentShows) => currentShows.filter((currentShow) => currentShow.id !== show.id));

      if (editingShowId === show.id) {
        cancelEditingShow();
      }

      if (duplicatingShowId === show.id) {
        cancelDuplicatingShow();
      }

      if (expandedShowId === show.id) {
        setExpandedShowId(null);
      }

      if (openCopyMenuShowId === show.id) {
        setOpenCopyMenuShowId(null);
      }

      await loadShows();
    } catch (error) {
      console.error("Failed to delete show.", error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  async function handleDuplicateShow(event: FormEvent<HTMLFormElement>, sourceShow: ShowRecord) {
    event.preventDefault();

    const name = duplicateFormState.name.trim() || sourceShow.name;
    const showDate = duplicateFormState.showDate;
    const slug = slugify(duplicateFormState.slug);
    const validationError = validateDuplicateValues({ showDate, slug });

    if (!name) {
      setErrorMessage("Show name is required.");
      return;
    }

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setActiveShowActionId(sourceShow.id);

    try {
      const supabase = createClient();
      const { data: createdShow, error: createShowError } = await supabase
        .from("shows")
        .insert({
          name,
          slug,
          show_date: showDate,
          venue: sourceShow.venue,
          venue_address: sourceShow.venue_address,
          directions_url: sourceShow.directions_url,
          call_time: sourceShow.call_time,
          soundcheck_time: sourceShow.soundcheck_time,
          guest_arrival_time: sourceShow.guest_arrival_time,
          band_arrival_time: sourceShow.band_arrival_time,
          show_start_time: sourceShow.show_start_time,
          contact_name: sourceShow.contact_name,
          contact_phone: sourceShow.contact_phone,
          parking_notes: sourceShow.parking_notes,
          load_in_notes: sourceShow.load_in_notes,
          announcements: sourceShow.announcements,
          guest_message: sourceShow.guest_message,
          opening_script: sourceShow.opening_script,
          intermission_script: sourceShow.intermission_script,
          closing_script: sourceShow.closing_script,
          is_archived: false,
        })
        .select("*")
        .single();

      if (createShowError) {
        throw createShowError;
      }

      const { data: sourceSetlist, error: sourceSetlistError } = await supabase
        .from("setlist_entries")
        .select(`
          *,
          guest_song:guest_song_id (
            id,
            show_id,
            title,
            key,
            tempo,
            song_type,
            submitted_by_name,
            created_at
          )
        `)
        .eq("show_id", sourceShow.id)
        .order("position", { ascending: true });

      if (sourceSetlistError) {
        await supabase.from("shows").delete().eq("id", createdShow.id);
        throw sourceSetlistError;
      }

      const typedSetlist = (sourceSetlist ?? []) as SetlistEntryRow[];

      if (typedSetlist.length > 0) {
        const guestSongsToClone = typedSetlist
          .filter((song) => song.source_type === "guest")
          .map((song) => (Array.isArray(song.guest_song) ? song.guest_song[0] : song.guest_song))
          .filter((song): song is ShowGuestSong => Boolean(song));
        const guestSongIdMap = new Map<string, string>();

        if (guestSongsToClone.length > 0) {
          const { data: insertedGuestSongs, error: insertGuestSongsError } = await supabase
            .from("show_guest_songs")
            .insert(
              guestSongsToClone.map((song) => ({
                show_id: createdShow.id,
                title: song.title,
                key: song.key,
                tempo: song.tempo,
                song_type: song.song_type,
                submitted_by_name: song.submitted_by_name,
              })),
            )
            .select("*");

          if (insertGuestSongsError) {
            await supabase.from("shows").delete().eq("id", createdShow.id);
            throw insertGuestSongsError;
          }

          guestSongsToClone.forEach((song, index) => {
            const insertedSong = insertedGuestSongs?.[index];
            if (insertedSong) {
              guestSongIdMap.set(song.id, insertedSong.id);
            }
          });
        }

        const { error: insertSetlistError } = await supabase.from("setlist_entries").insert(
          typedSetlist.map((song) => ({
            show_id: createdShow.id,
            section: song.section,
            position: song.position,
            source_type: song.source_type,
            song_id: song.source_type === "library" ? song.song_id : null,
            guest_song_id:
              song.source_type === "guest" && song.guest_song_id
                ? guestSongIdMap.get(song.guest_song_id) ?? null
                : null,
            custom_title: song.custom_title,
          })),
        );

        if (insertSetlistError) {
          await supabase.from("shows").delete().eq("id", createdShow.id);
          throw insertSetlistError;
        }
      }

      router.push(`/admin/${createdShow.slug}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActiveShowActionId(null);
    }
  }

  function jumpToSection(sectionId: string) {
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function openDashboardTab(section: DashboardSection, sectionId?: string) {
    setExpandedDashboardSections((currentSections) => ({
      ...currentSections,
      [section]: true,
    }));

    if (sectionId) {
      jumpToSection(sectionId);
    }
  }

  function toggleDashboardSection(section: DashboardSection) {
    setExpandedDashboardSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section],
    }));
  }

  function toggleMainDashboardPanel(panel: MainDashboardPanel) {
    setExpandedMainPanels((currentPanels) => ({
      ...currentPanels,
      [panel]: !currentPanels[panel],
    }));
  }

  function renderEditForm(show: ShowRecord, title: string, description: string) {
    return (
      <form className="grid gap-4" onSubmit={(event) => handleSaveShow(event, show.id)}>
        <div className="flex flex-col gap-1">
          <h4 className="text-lg font-semibold text-stone-900">{title}</h4>
          <p className="text-sm text-stone-600">{description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Show Name
            <input
              type="text"
              name="name"
              value={editFormState.name}
              onChange={(event) =>
                handleChange(event, {
                  mode: "edit",
                  preserveManualSlug: true,
                })
              }
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Show Date
            <input
              type="date"
              name="showDate"
              value={editFormState.showDate}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Venue
            <input
              type="text"
              name="venue"
              value={editFormState.venue}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            Slug
            <input
              type="text"
              name="slug"
              value={editFormState.slug}
              onChange={(event) => handleChange(event, { mode: "edit" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={activeShowActionId === show.id}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={cancelEditingShow}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  function renderDuplicateForm(show: ShowRecord, description: string) {
    return (
      <form className="grid gap-4" onSubmit={(event) => handleDuplicateShow(event, show)}>
        <div className="flex flex-col gap-1">
          <h4 className="text-lg font-semibold text-stone-900">Duplicate {show.name}</h4>
          <p className="text-sm text-stone-600">{description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            New Show Name
            <input
              type="text"
              name="name"
              value={duplicateFormState.name}
              onChange={(event) =>
                handleChange(event, {
                  mode: "duplicate",
                  preserveManualSlug: true,
                })
              }
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              placeholder={show.name}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
            New Show Date
            <input
              type="date"
              name="showDate"
              value={duplicateFormState.showDate}
              onChange={(event) => handleChange(event, { mode: "duplicate" })}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
          New Slug
          <input
            type="text"
            name="slug"
            value={duplicateFormState.slug}
            onChange={(event) => handleChange(event, { mode: "duplicate" })}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600"
            placeholder={`${show.slug}-copy`}
            required
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={activeShowActionId === show.id}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            Create Duplicate
          </button>
          <button
            type="button"
            onClick={cancelDuplicatingShow}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  function renderShowCard(show: ShowRecord, isArchived: boolean) {
    const isEditing = editingShowId === show.id;
    const isDuplicating = duplicatingShowId === show.id;
    const tone = getShowCardTone(isArchived);
    const isCopyMenuOpen = openCopyMenuShowId === show.id;
    const isExpanded = expandedShowId === show.id;
    const timeLabel = show.show_start_time?.trim() || null;

    return (
      <article
        key={show.id}
        className={`relative overflow-visible rounded-3xl border p-5 shadow-sm transition duration-200 hover:shadow-lg sm:p-6 ${
          isCopyMenuOpen ? "z-30" : ""
        } ${tone.card}`}
      >
        {isEditing
          ? renderEditForm(
              show,
              isArchived ? "Edit Archived Show" : "Edit Show",
              isArchived
                ? "Update the archived record now, then restore it whenever you're ready."
                : "Update the core show details without affecting setlists, guests, or portal data.",
            )
          : isDuplicating
            ? renderDuplicateForm(
                show,
                isArchived
                  ? "Build a fresh active show from this archived template."
                  : "Create a new active show with the same itinerary, settings, and official setlist.",
            )
          : (
              <>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${tone.badge}`}
                        >
                          {tone.status}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                          {show.slug}
                        </span>
                      </div>
                      <h4 className="mt-3 text-xl font-semibold leading-tight tracking-tight text-stone-900">
                        {show.name}
                      </h4>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
                        <span>{formatShowDate(show.show_date)}</span>
                        {timeLabel ? <span>{timeLabel}</span> : null}
                        {show.venue ? <span>{show.venue}</span> : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedShowId((currentId) => (currentId === show.id ? null : show.id))}
                      className="min-h-12 min-w-[10rem] rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      {isExpanded ? "Hide Tools" : "Open Tools"}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className={`mt-5 grid gap-4 overflow-visible border-t pt-5 ${tone.divider}`}>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/admin/${show.slug}`}
                        className="flex min-h-12 min-w-[9rem] items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
                      >
                        Admin
                      </Link>
                      <Link
                        href={`/band/${show.slug}`}
                        className="flex min-h-12 min-w-[9rem] items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Band
                      </Link>
                      <Link
                        href={`/admin/${show.slug}?tab=setlist`}
                        className="flex min-h-12 min-w-[9rem] items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Setlist
                      </Link>
                      <Link
                        href={`/admin/${show.slug}?tab=show-details`}
                        className="flex min-h-12 min-w-[9rem] items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Itinerary
                      </Link>
                      <Link
                        href={`/admin/${show.slug}?tab=promo-materials`}
                        className="flex min-h-12 min-w-[9rem] items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        Promo
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-3 overflow-visible">
                      <div className="relative min-w-[11rem] flex-1 sm:flex-none">
                        <button
                          type="button"
                          onClick={(event) => handleToggleCopyMenu(event, show.id)}
                          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:min-w-[11rem]"
                        >
                          Copy Links
                        </button>

                        {isCopyMenuOpen ? (
                          <div
                            className="absolute bottom-full left-0 z-50 min-w-[12rem] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg mb-2 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <button
                              type="button"
                              onClick={() => handleCopyLink(show.slug, "guest")}
                              className="flex w-full items-center justify-center px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedLinkKey === `guest-${show.slug}` ? "Copied Guest Link" : "Copy Guest Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(show.slug, "band")}
                              className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedLinkKey === `band-${show.slug}` ? "Copied Band Link" : "Copy Band Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(show.slug, "mc")}
                              className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedLinkKey === `mc-${show.slug}` ? "Copied MC Link" : "Copy MC Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(show.slug, "admin")}
                              className="flex w-full items-center justify-center border-t border-stone-200 px-4 py-2.5 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedLinkKey === `admin-${show.slug}` ? "Copied Admin Link" : "Copy Admin Link"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditingShow(show)}
                        className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:flex-none"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => startDuplicatingShow(show)}
                        className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-100 sm:flex-none"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetArchived(show.id, !isArchived)}
                        disabled={activeShowActionId === show.id}
                        className={`flex min-h-12 min-w-[9rem] flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white transition disabled:cursor-not-allowed sm:flex-none ${
                          isArchived
                            ? "bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400"
                            : "bg-stone-800 hover:bg-black disabled:bg-stone-500"
                        }`}
                      >
                        {isArchived ? "Restore" : "Archive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteShow(show)}
                        disabled={activeShowActionId === show.id}
                        className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-400 sm:flex-none"
                      >
                        Delete Show
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
      </article>
    );
  }

  return (
    <AdminGate
      slug="shows-dashboard"
      resourceLabel="the show management dashboard"
      continueLabel="Continue to Dashboard"
    >
      <main className="min-h-screen bg-[#020817] px-4 py-8 text-stone-900 dark:bg-[radial-gradient(circle_at_top_right,rgba(29,78,216,0.10),transparent_34%),linear-gradient(180deg,#020817,#071126_48%,#0b1629)] dark:text-slate-100 sm:px-6 sm:py-10 lg:px-8">
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          {currentShow ? (
            <div className="sticky top-3 z-30">
              <AdminQuickNav
                slug={currentShow.slug}
                accessSlug="shows-dashboard"
                currentView="dashboard"
                timelineMessages={dashboardTimelineMessages}
              />
            </div>
          ) : null}

          <header
            className="overflow-hidden rounded-[28px] border border-white/10 shadow-sm"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url('/portal_bkg-production-v2.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <div className="relative overflow-hidden rounded-[28px] px-6 py-8 text-white sm:px-8">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-4 right-4 hidden w-40 rounded-r-[24px] opacity-50 lg:block"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(200,155,60,0.28) 0px, rgba(200,155,60,0.28) 1px, transparent 1px, transparent 18px)",
                  }}
                />
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-6 xl:flex-nowrap">
                    {showLogo ? (
                    <div className="w-full max-w-[300px] sm:max-w-[340px] lg:max-w-[360px] xl:max-w-[390px]">
                      <Image
                        src="/stageflow-logo-v2.png"
                        alt="StageFlow logo"
                        width={320}
                        height={160}
                        className="h-auto w-full max-w-full object-contain"
                        onError={() => setShowLogo(false)}
                        priority
                      />
                    </div>
                  ) : null}

                  <div className="stage-gold-divider max-w-2xl space-y-2 xl:max-w-xl">
                    <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                      Control Center
                    </p>
                    <p className="text-sm leading-6 text-stone-300 sm:text-base">
                      Shows, songs, setlists, guests, rehearsal tools, and promo materials in one place.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                  <div className="w-fit self-start rounded-full border border-[rgba(200,155,60,0.24)] bg-[rgba(200,155,60,0.12)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[#f1dfb7] shadow-[0_0_20px_rgba(200,155,60,0.12)] sm:self-end">
                    {stageflowDashboardVersion}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <section className="stage-premium-panel rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm dark:border-[rgba(255,255,255,0.10)] dark:bg-[#111111] sm:p-6">
            <div className="grid gap-6">
              <section className="stage-premium-panel rounded-3xl border border-stone-200 bg-stone-50/70 p-4 dark:border-[rgba(255,255,255,0.10)] dark:bg-gradient-to-br dark:from-[#111111] dark:via-[#0d0d0d] dark:to-[#080808] sm:p-5">
                <button
                  type="button"
                  onClick={() => toggleMainDashboardPanel("showSnapshot")}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900 dark:text-emerald-300">
                      What Matters Right Now
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">
                      Current Show Control Center
                    </h2>
                    <p className="text-sm text-stone-600 dark:text-slate-300">
                      The next show, what still needs attention, and the operational numbers that matter most right now.
                    </p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-700 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#181818] dark:text-slate-200">
                    {expandedMainPanels.showSnapshot ? "-" : "+"}
                  </span>
                </button>

                {expandedMainPanels.showSnapshot ? (
                  <div className="mt-5">
                {isLoading ? (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#141414] dark:text-slate-300">
                    Loading control-center highlights...
                  </div>
                ) : currentShow ? (
                  <div className="grid gap-4 sm:gap-5">
                    <section className="stage-premium-card rounded-3xl border border-slate-700/60 bg-gradient-to-br from-[#101827] via-[#111b2d] to-[#0b1220] p-4 sm:p-5">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 items-start gap-4">
                            {currentShow.show_logo_url ? (
                              <div className="shrink-0 pt-0.5">
                                <img
                                  src={currentShow.show_logo_url}
                                  alt={`${currentShow.name} logo`}
                                  className="h-auto max-h-12 w-full max-w-[120px] object-contain"
                                />
                              </div>
                            ) : null}

                            <div className="stage-gold-divider min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                                Next Show
                              </p>
                              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[#f5f5f5] sm:text-[1.7rem]">
                                {currentShow.name}
                              </h3>
                              <div className="mt-2 grid gap-1 text-sm text-[#b8b8b8]">
                                <p className="flex items-center gap-2">
                                  <DashboardIcon><CalendarIcon /></DashboardIcon>
                                  {formatShowDate(currentShow.show_date)}
                                </p>
                                <p className="flex items-center gap-2">
                                  <DashboardIcon><MapPinIcon /></DashboardIcon>
                                  {currentShow.venue || "Venue not set"}
                                </p>
                                <p className="flex items-center gap-2">
                                  <DashboardIcon><HashIcon /></DashboardIcon>
                                  {currentShow.slug}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[520px]">
                            <Link
                              href={`/admin/${currentShow.slug}/door`}
                              aria-label={`Open Door Mode for ${currentShow.name}`}
                              className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-700 px-4 py-3 text-left text-white shadow-[0_0_28px_rgba(5,150,105,0.28)] transition hover:border-emerald-300/60 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                              <DashboardIcon className="h-10 w-10 rounded-xl bg-white/10 text-emerald-100">
                                <DoorModeIcon />
                              </DashboardIcon>
                              <span className="min-w-0">
                                <span className="block text-base font-semibold">Door Mode</span>
                                <span className="block text-sm text-emerald-100">Live Ticket Check-In</span>
                              </span>
                              <span className="ml-auto text-xl text-emerald-100 transition group-hover:translate-x-0.5" aria-hidden="true">
                                &rarr;
                              </span>
                            </Link>
                            <Link
                              href={`/band/${currentShow.slug}/live`}
                              aria-label={`Open Live Mode for ${currentShow.name}`}
                              className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-3 text-left text-white transition hover:bg-[rgba(255,255,255,0.09)]"
                            >
                              <DashboardIcon className="h-10 w-10 rounded-xl bg-white/5">
                                <MicrophoneIcon />
                              </DashboardIcon>
                              <span className="min-w-0">
                                <span className="block text-base font-semibold">Live Mode</span>
                                <span className="block text-sm text-stone-300">Run the Show</span>
                              </span>
                            </Link>
                            <Link
                              href={`/admin/${currentShow.slug}?tab=comp-tickets`}
                              className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[rgba(255,255,255,0.09)]"
                            >
                              <DashboardIcon><ShieldIcon /></DashboardIcon>
                              Ticket Sales
                            </Link>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            {
                              label: "Online Tickets Sold",
                              value: currentShowMetrics.onlineTicketsSold.toString(),
                              detail: "Completed online purchases",
                              icon: <MusicNoteIcon />,
                            },
                            {
                              label: "Reserved Seats",
                              value: currentShowMetrics.reservedSeatCapacity
                                ? `${currentShowMetrics.reservedSeatsAssigned}/${currentShowMetrics.reservedSeatCapacity}`
                                : currentShowMetrics.reservedSeatsAssigned.toString(),
                              detail: "Currently assigned",
                              icon: <MicrophoneIcon />,
                            },
                            {
                              label: "Sponsor & Comp",
                              value: currentShowMetrics.sponsorCompTicketsIssued.toString(),
                              detail: "Tickets issued",
                              icon: <CheckCircleIcon />,
                            },
                            {
                              label: "Needs Attention",
                              value: needsAttentionItems.length.toString(),
                              detail: needsAttentionItems.length === 0 ? "Nothing currently needs attention" : "Outstanding show tasks",
                              icon: <ListIcon />,
                            },
                          ].map((card) => (
                            <div
                              key={card.label}
                              className="stage-premium-card rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#141414] px-4 py-5 sm:min-h-[172px]"
                            >
                              <div className="flex items-center gap-2">
                                <DashboardIcon className="h-8 w-8 text-emerald-300 sm:h-9 sm:w-9">{card.icon}</DashboardIcon>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                                  {card.label}
                                </p>
                              </div>
                              <p className="mt-4 text-3xl font-extrabold tracking-tight text-[#f5f5f5] sm:text-[2.35rem]">
                                {card.value}
                              </p>
                              <p className="mt-2 text-sm text-[#b8b8b8]">
                                {card.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                      <section className="stage-premium-card rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#141414] sm:p-5">
                        <div className="flex flex-col gap-1">
                          <h3 className="stage-gold-divider text-lg font-semibold text-stone-900 dark:text-slate-100">
                            Needs Attention
                          </h3>
                          <p className="text-sm text-stone-600 dark:text-slate-300">
                            A short punch list for the next show.
                          </p>
                        </div>

                        {needsAttentionItems.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900 dark:border-[rgba(200,155,60,0.22)] dark:bg-[rgba(200,155,60,0.14)] dark:text-[#f1dfb7]">
                            Nothing currently needs attention.
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3">
                            {needsAttentionItems.map((item) => (
                              <article
                                key={`${item.title}-${item.detail}`}
                                className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#181818]"
                              >
                                <h4 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                                  {item.title}
                                </h4>
                                <p className="mt-1 text-sm leading-5 text-stone-600 dark:text-slate-300">
                                  {item.detail}
                                </p>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="stage-premium-card rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#141414] sm:p-5">
                        <div className="flex flex-col gap-1">
                          <h3 className="stage-gold-divider text-lg font-semibold text-stone-900 dark:text-slate-100">
                            Show Progress
                          </h3>
                          <p className="text-sm text-stone-600 dark:text-slate-300">
                            A quick readiness check built from the current show data already in StageFlow.
                          </p>
                        </div>

                        {showProgressItems.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#181818] dark:text-slate-400">
                            No upcoming show is currently configured.
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-2.5">
                            {showProgressItems.map((item) => (
                              <Link
                                key={item.label}
                                href={item.href}
                                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 transition hover:-translate-y-0.5 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#181818] ${
                                  item.complete
                                    ? "border-stone-200 bg-white opacity-75 hover:border-stone-300 dark:hover:border-[rgba(255,255,255,0.16)]"
                                    : "border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:border-amber-400/35"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                                      item.complete
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                    }`}
                                    aria-hidden="true"
                                  >
                                    {item.complete ? "✓" : "!"}
                                  </span>
                                  <span className="text-sm font-medium text-stone-900 dark:text-slate-100">
                                    {item.label}
                                  </span>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                  item.complete
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                }`}>
                                  {item.complete ? "Ready" : "Needs setup"}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>

                    <div id="next-show-links" className="grid gap-3">
                      <div className="stage-premium-card rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[#141414] px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isCopyLinksExpanded}
                          onClick={() => setIsCopyLinksExpanded((current) => !current)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                              Copy Links
                            </p>
                            <p className="mt-1 text-sm text-[#b8b8b8]">
                              Quick access to guest, band, MC, and admin links.
                            </p>
                          </div>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] text-sm font-semibold text-[#f5f5f5]">
                            {isCopyLinksExpanded ? "-" : "+"}
                          </span>
                        </button>

                        {isCopyLinksExpanded ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(currentShow.slug, "guest")}
                              className="inline-flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-2.5 text-sm font-semibold text-[#f5f5f5] transition hover:bg-[rgba(255,255,255,0.06)]"
                            >
                              {copiedLinkKey === `guest-${currentShow.slug}` ? "Copied Guest Link" : "Copy Guest Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(currentShow.slug, "band")}
                              className="inline-flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-2.5 text-sm font-semibold text-[#f5f5f5] transition hover:bg-[rgba(255,255,255,0.06)]"
                            >
                              {copiedLinkKey === `band-${currentShow.slug}` ? "Copied Band Link" : "Copy Band Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(currentShow.slug, "mc")}
                              className="inline-flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-2.5 text-sm font-semibold text-[#f5f5f5] transition hover:bg-[rgba(255,255,255,0.06)]"
                            >
                              {copiedLinkKey === `mc-${currentShow.slug}` ? "Copied MC Link" : "Copy MC Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(currentShow.slug, "admin")}
                              className="inline-flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#1f1f1f] px-4 py-2.5 text-sm font-semibold text-[#f5f5f5] transition hover:bg-[rgba(255,255,255,0.06)]"
                            >
                              {copiedLinkKey === `admin-${currentShow.slug}` ? "Copied Admin Link" : "Copy Admin Link"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-500 dark:border-[rgba(255,255,255,0.10)] dark:bg-[#141414] dark:text-slate-400">
                    No active show is available yet. Create a show to light up the control center.
                  </div>
                )}
                  </div>
                ) : null}
              </section>

            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <button
              type="button"
              onClick={() => toggleMainDashboardPanel("dashboard")}
              className="flex w-full items-start justify-between gap-4 border-b border-stone-200 pb-5 text-left dark:border-slate-800"
            >
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">Dashboard</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">
                  Open only the workspace you need and keep the rest of the dashboard compact.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {expandedMainPanels.dashboard ? "-" : "+"}
              </span>
            </button>
            {expandedMainPanels.dashboard ? (
              <div className="pt-6">
              <div className="grid gap-4">
                {dashboardSections.map((section) => {
                  const isExpanded = expandedDashboardSections[section.id];

                  return (
                    <section
                      key={section.id}
                      id={section.id === "create" ? "create-show-section" : undefined}
                      className="rounded-3xl border border-stone-200 bg-stone-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 sm:p-5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDashboardSection(section.id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl text-left"
                      >
                        <div>
                          <h3 className="text-xl font-semibold text-stone-900 dark:text-slate-100">
                            {section.label}
                          </h3>
                          <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">
                            {section.description}
                          </p>
                        </div>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {isExpanded ? "-" : "+"}
                        </span>
                      </button>

                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          isExpanded ? "mt-5 max-h-[240rem] border-t border-stone-200 pt-5 opacity-100 dark:border-slate-800" : "max-h-0 opacity-0"
                        }`}
                      >
                        {section.id === "active" ? (
                          isLoading ? (
                            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                              Loading shows...
                            </div>
                          ) : activeShows.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-sm text-stone-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              No active shows yet. Open Create Show to get the next event started.
                            </div>
                          ) : (
                            <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                              {activeShows.map((show) => renderShowCard(show, false))}
                            </div>
                          )
                        ) : null}

                        {section.id === "create" ? (
                          <div className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                            <div className="flex flex-col gap-1">
                              <h4 className="text-xl font-semibold text-stone-900 dark:text-slate-100">Create New Show</h4>
                              <p className="text-sm text-stone-600 dark:text-slate-300">
                                Start a new show record here, then jump straight into the admin portal to finish setup.
                              </p>
                            </div>

                            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                                Duplicate Existing Show
                                <select
                                  value={prefillSourceShowId}
                                  onChange={handlePrefillFromExistingShow}
                                  className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                  <option value="">Start from a blank show</option>
                                  {shows.map((show) => (
                                    <option key={show.id} value={show.id}>
                                      {show.name} ({show.slug})
                                    </option>
                                  ))}
                                </select>
                                <span className="text-xs font-normal text-stone-500 dark:text-slate-400">
                                  Optional: prefill the venue from an existing show to speed up setup.
                                </span>
                              </label>

                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                                  Show Name
                                  <input
                                    type="text"
                                    name="name"
                                    value={formState.name}
                                    onChange={handleChange}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    placeholder="Cumberland Mountain Music Show"
                                    required
                                  />
                                </label>

                                <div className="grid gap-4 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                                    Show Date
                                    <input
                                      type="date"
                                      name="showDate"
                                      value={formState.showDate}
                                      onChange={handleChange}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                  </label>

                                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                                    Venue
                                    <input
                                      type="text"
                                      name="venue"
                                      value={formState.venue}
                                      onChange={handleChange}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                      placeholder="Optional venue"
                                    />
                                  </label>
                                </div>

                                <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                                  Slug
                                  <input
                                    type="text"
                                    name="slug"
                                    value={formState.slug}
                                    onChange={handleChange}
                                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    placeholder="cmms-april-27"
                                    required
                                  />
                                </label>

                                <div className="flex flex-wrap items-center gap-3 pt-2">
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                  >
                                    {isSubmitting ? "Creating Show..." : "Create Show"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPrefillSourceShowId("");
                                      setFormState(initialFormState);
                                    }}
                                    className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                                  >
                                    Clear Form
                                  </button>
                                </div>
                              </form>
                          </div>
                        ) : null}

                        {section.id === "archived" ? (
                          isLoading ? (
                            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                              Loading archived shows...
                            </div>
                          ) : archivedShows.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-sm text-stone-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              No archived shows yet.
                            </div>
                          ) : (
                            <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                              {archivedShows.map((show) => renderShowCard(show, true))}
                            </div>
                          )
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
              </div>
            ) : null}
          </section>

        </section>
      </main>
    </AdminGate>
  );
}

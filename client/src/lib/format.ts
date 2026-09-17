import type { JobStatus } from "./api";

/**
 * Times are shown in the business's timezone, not the viewer's. A dispatcher
 * in Mokena and an investor opening the demo in London should both see
 * Tomas arriving at 10:30.
 */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function clockParts(iso: string, timeZone: string): { hour: number; minute: number } {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    partsFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(iso));
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

/** Minutes after local midnight in the given zone. */
export function minutesOfDay(iso: string, timeZone: string): number {
  const { hour, minute } = clockParts(iso, timeZone);
  return hour * 60 + minute;
}

/** "10:30", "1:00" — the compact clock the board uses. */
export function clock(iso: string, timeZone: string): string {
  const { hour, minute } = clockParts(iso, timeZone);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")}`;
}

/** "10:30 AM" — for sentences a customer reads. */
export function clockWithPeriod(iso: string, timeZone: string): string {
  return `${clock(iso, timeZone)} ${clockParts(iso, timeZone).hour < 12 ? "AM" : "PM"}`;
}

export function timeRange(startIso: string, endIso: string, timeZone: string): string {
  return `${clock(startIso, timeZone)}–${clock(endIso, timeZone)}`;
}

/** "Wed 16 Sep" in the business's zone. */
export function shortDate(when: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(when));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$379.00" — exact, for documents. */
export function money(cents: number): string {
  return dollars.format(cents / 100);
}

/** "$4,180" — for headline numbers where the cents are noise. */
export function moneyRounded(cents: number): string {
  return wholeDollars.format(Math.round(cents / 100));
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function surname(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** Colour means job state and nothing else, so this is the only mapping from one to the other. */
export type Tone = "done" | "active" | "waiting" | "blocked" | "quiet";

export const STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  unscheduled: { label: "Unscheduled", tone: "quiet" },
  scheduled: { label: "Scheduled", tone: "quiet" },
  en_route: { label: "En route", tone: "active" },
  on_site: { label: "On site", tone: "active" },
  awaiting_approval: { label: "Awaiting approval", tone: "waiting" },
  parts_on_order: { label: "Parts on order", tone: "blocked" },
  done: { label: "Done", tone: "done" },
  cancelled: { label: "Cancelled", tone: "quiet" },
};

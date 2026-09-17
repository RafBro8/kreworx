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

/** The local calendar date ("YYYY-MM-DD") of an instant in a zone. */
export function dateInZone(when: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(when));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The UTC instant for a wall-clock time on a date in the business's zone —
 * the inverse of `minutesOfDay`. Mirrors the server's conversion, so a job the
 * dispatcher puts at 1:30 PM is saved at 1:30 PM in Mokena even when the
 * dispatcher's laptop is set to another timezone.
 */
export function zonedIso(date: string, minutesOfDayValue: number, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutesOfDayValue);
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(instant / 60_000) * 60_000;
  };
  // Sample the offset on both sides of the date so a DST change that day resolves correctly.
  const candidates = [86_400_000, -86_400_000]
    .map((shift) => wallAsUtc - offsetAt(wallAsUtc - shift))
    .filter((instant) => dateInZone(new Date(instant), timeZone) === date && minutesOfDay(new Date(instant).toISOString(), timeZone) === minutesOfDayValue)
    .sort((a, b) => a - b);
  return new Date(candidates[0] ?? wallAsUtc - offsetAt(wallAsUtc)).toISOString();
}

/** "Wednesday 16 September" — for a date heading. */
export function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** What a button says when it moves a job to this status. */
export const STATUS_ACTION: Record<JobStatus, string> = {
  unscheduled: "Back to the queue",
  scheduled: "Back to scheduled",
  en_route: "On the way",
  on_site: "Arrived",
  awaiting_approval: "Waiting on approval",
  parts_on_order: "Parts on order",
  done: "Mark done",
  cancelled: "Cancel job",
};

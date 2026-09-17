/**
 * Calendar maths in a named timezone, using only Intl.
 *
 * Jobs are stored as UTC instants, but a contractor thinks in local days and
 * wall-clock times: "tomorrow at 9:30" means 9:30 in Mokena whatever the
 * server's clock says. These helpers are the only place that conversion
 * happens.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(instant: number, timeZone: string): Parts {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const p = partsAt(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The calendar date ("YYYY-MM-DD") of an instant in a zone. */
export function dateIn(instant: Date, timeZone: string): string {
  const p = partsAt(instant.getTime(), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight of an instant in a zone. */
export function minutesIn(instant: Date, timeZone: string): number {
  const p = partsAt(instant.getTime(), timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * The UTC instant for a wall-clock time on a local date. Across a DST change
 * the offset is sampled on both sides, so a time that exists once resolves
 * exactly, and a time repeated in the autumn resolves to its first occurrence.
 */
export function zonedTime(date: string, minutesOfDay: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutesOfDay);

  const candidates = [DAY_MS, -DAY_MS]
    .map((shift) => wallAsUtc - offsetAt(wallAsUtc - shift, timeZone))
    .filter((instant) => {
      const p = partsAt(instant, timeZone);
      return `${p.year}-${pad(p.month)}-${pad(p.day)}` === date && p.hour * 60 + p.minute === minutesOfDay;
    })
    .sort((a, b) => a - b);

  // A time skipped by spring-forward has no valid instant; fall back to the
  // naive conversion, which lands an hour later - what a person would expect.
  return new Date(candidates[0] ?? wallAsUtc - offsetAt(wallAsUtc, timeZone));
}

/** Add whole calendar days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The [start, end) UTC range covering a local calendar day. */
export function dayRange(date: string, timeZone: string): { start: Date; end: Date } {
  return { start: zonedTime(date, 0, timeZone), end: zonedTime(addDays(date, 1), 0, timeZone) };
}

/** Monday of the week containing a date. */
export function startOfWeek(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/** "10:30 AM" in a zone, for messages a person reads. */
export function clockLabel(instant: Date, timeZone: string): string {
  const minutes = minutesIn(instant, timeZone);
  const hour = Math.floor(minutes / 60);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${pad(minutes % 60)} ${hour < 12 ? "AM" : "PM"}`;
}

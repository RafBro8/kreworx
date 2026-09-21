import { env } from "../config/env";

/**
 * The demo runs on a fast clock.
 *
 * A real day is no use in a demo: someone opening the link at nine in the
 * evening would find every job finished and nothing moving. So the working day
 * is replayed over an hour. It starts where the designs start — Tomas on his
 * way to Amara's, the $379 quote unanswered — and ends as the last job of the
 * day finishes, at which point the demo is rebuilt and the day begins again.
 *
 * The hour is counted from when the demo was last built, not from the clock on
 * the wall, so pressing Reset really does hand you a fresh morning.
 *
 * Everything the app shows is a real timestamp; this only decides which moment
 * of the day the demo is standing in.
 */

/**
 * Where each run of the day begins: 10 AM, shortly before the moment the
 * artboards show. Starting a little early matters — the half hour while Tomas
 * is on his way to Amara is what the customer screen is built around, and from
 * 10:20 that would be over in ninety seconds of real time.
 */
export const STORY_START_MINUTES = 10 * 60;
/** And where it ends: 4 PM, when the last job on the board is finished. */
export const DAY_END_MINUTES = 16 * 60;

export const CYCLE_MS = 60 * 60 * 1000;
const SPAN_MINUTES = DAY_END_MINUTES - STORY_START_MINUTES;

/** Demo minutes per real minute — six, so a two-hour job runs in twenty. */
export const SPEED = SPAN_MINUTES / 60;

export type DemoClock = {
  /** Minutes after local midnight in the business's timezone. */
  minutes: number;
  /** How fast the demo day runs, in demo minutes per real minute. */
  speed: number;
  /** True once the day has run its course and the demo is due to be rebuilt. */
  finished: boolean;
  /** Seconds until the day restarts. */
  endsInSeconds: number;
};

export function demoClock(now: Date = new Date(), cycleStartedAt?: Date | null): DemoClock {
  // With no record of when the day began — a fresh database, or a demo built
  // by an older version — treat the current hour as the run.
  const startedAt = cycleStartedAt ?? new Date(Math.floor(now.getTime() / CYCLE_MS) * CYCLE_MS);
  const elapsed = Math.max(now.getTime() - startedAt.getTime(), 0);
  const through = Math.min(elapsed / CYCLE_MS, 1);

  return {
    minutes: STORY_START_MINUTES + through * SPAN_MINUTES,
    speed: SPEED,
    finished: elapsed >= CYCLE_MS,
    endsInSeconds: Math.max(Math.round((CYCLE_MS - elapsed) / 1000), 0),
  };
}

/** What the browser needs to keep its own copy of the demo clock ticking. */
export function demoClockPayload(
  cycleStartedAt?: Date | null,
  now: Date = new Date(),
): { minutes: number; speed: number; endsInSeconds: number } | null {
  if (!env.demoMode) return null;
  const clock = demoClock(now, cycleStartedAt);
  return { minutes: Math.round(clock.minutes), speed: clock.speed, endsInSeconds: clock.endsInSeconds };
}

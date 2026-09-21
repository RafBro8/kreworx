import { env } from "../config/env";

/**
 * The demo runs on a fast clock.
 *
 * A real day is no use in a demo: someone opening the link at nine in the
 * evening would find every job finished and nothing moving. So the working day
 * is replayed over each real hour. It starts where the designs start — twenty
 * past ten, Tomas on his way to Amara's, the $379 quote unanswered — and runs
 * to the end of the day, then the hour turns and the demo is rebuilt back to
 * that same moment.
 *
 * Everything the app shows is a real timestamp; this only decides which moment
 * of the day the demo is currently standing in.
 */

/**
 * Where each run of the day begins: 10 AM, shortly before the moment the
 * artboards show. Starting a little early matters — the half hour while Tomas
 * is on his way to Amara is what the customer screen is built around, and from
 * 10:20 that would be over in ninety seconds of real time.
 */
export const STORY_START_MINUTES = 10 * 60;
/** And where it ends: 5 PM, after the last job on the board. */
export const DAY_END_MINUTES = 17 * 60;

const CYCLE_MS = 60 * 60 * 1000;
const SPAN_MINUTES = DAY_END_MINUTES - STORY_START_MINUTES;

/** Demo minutes that pass per real minute — about 6.7, so a two-hour job runs in eighteen. */
export const SPEED = SPAN_MINUTES / 60;

export type DemoClock = {
  /** Minutes after local midnight in the business's timezone. */
  minutes: number;
  /** How fast the demo day runs, in demo minutes per real minute. */
  speed: number;
  /** When the current run of the day began. A new one means the demo was rebuilt. */
  cycleStartedAt: Date;
  /** Seconds until the day restarts. */
  endsInSeconds: number;
};

export function demoClock(now: Date = new Date()): DemoClock {
  const cycleStartedAt = new Date(Math.floor(now.getTime() / CYCLE_MS) * CYCLE_MS);
  const elapsed = now.getTime() - cycleStartedAt.getTime();

  return {
    minutes: STORY_START_MINUTES + (elapsed / CYCLE_MS) * SPAN_MINUTES,
    speed: SPEED,
    cycleStartedAt,
    endsInSeconds: Math.round((CYCLE_MS - elapsed) / 1000),
  };
}

/** What the browser needs to keep its own copy of the demo clock ticking. */
export function demoClockPayload(now: Date = new Date()): { minutes: number; speed: number; endsInSeconds: number } | null {
  if (!env.demoMode) return null;
  const clock = demoClock(now);
  return { minutes: Math.round(clock.minutes), speed: clock.speed, endsInSeconds: clock.endsInSeconds };
}

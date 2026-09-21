import { describe, expect, it } from "vitest";

import { CYCLE_MS, DAY_END_MINUTES, demoClock, STORY_START_MINUTES } from "./clock";

const began = new Date("2026-09-19T14:07:00Z");
const after = (minutes: number) => new Date(began.getTime() + minutes * 60_000);

describe("the demo clock", () => {
  it("starts the day where the designs start it", () => {
    expect(demoClock(began, began).minutes).toBe(STORY_START_MINUTES);
  });

  it("is half way through the day half way through the hour", () => {
    const half = demoClock(after(30), began);
    expect(half.minutes).toBe((STORY_START_MINUTES + DAY_END_MINUTES) / 2);
    expect(half.endsInSeconds).toBe(1800);
    expect(half.finished).toBe(false);
  });

  it("reaches the end of the day as the hour runs out", () => {
    const nearly = demoClock(after(59.99), began);
    expect(nearly.minutes).toBeCloseTo(DAY_END_MINUTES, 0);
    expect(nearly.finished).toBe(false);
  });

  it("reports the day finished once the hour is up, and does not run past the end", () => {
    const over = demoClock(new Date(began.getTime() + CYCLE_MS + 60_000), began);
    expect(over.finished).toBe(true);
    expect(over.minutes).toBe(DAY_END_MINUTES);
    expect(over.endsInSeconds).toBe(0);
  });

  it("counts from when the demo was built, so a rebuild hands back a fresh morning", () => {
    const late = after(50);
    expect(demoClock(late, began).minutes).toBeGreaterThan(STORY_START_MINUTES);
    // Rebuilt just now: the day starts over even though the wall clock did not.
    expect(demoClock(late, late).minutes).toBe(STORY_START_MINUTES);
  });

  it("falls back to the current hour when nothing has recorded a start", () => {
    const clock = demoClock(new Date("2026-09-19T14:30:00Z"), null);
    expect(clock.minutes).toBe((STORY_START_MINUTES + DAY_END_MINUTES) / 2);
  });

  it("runs fast enough to watch, but not so fast the board flickers", () => {
    const { speed } = demoClock(began, began);
    // A two-hour job should take a few minutes of real time, not seconds.
    expect(120 / speed).toBeGreaterThan(10);
    expect(120 / speed).toBeLessThan(30);
  });
});

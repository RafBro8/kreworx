import { describe, expect, it } from "vitest";

import { DAY_END_MINUTES, demoClock, STORY_START_MINUTES } from "./clock";

describe("the demo clock", () => {
  it("starts the day where the designs start it", () => {
    expect(demoClock(new Date("2026-09-19T14:00:00Z")).minutes).toBe(STORY_START_MINUTES);
  });

  it("reaches the end of the day as the real hour runs out", () => {
    expect(demoClock(new Date("2026-09-19T14:59:59.999Z")).minutes).toBeCloseTo(DAY_END_MINUTES, 1);
  });

  it("is half way through the day half way through the hour", () => {
    const half = demoClock(new Date("2026-09-19T14:30:00Z"));
    expect(half.minutes).toBe((STORY_START_MINUTES + DAY_END_MINUTES) / 2);
    expect(half.endsInSeconds).toBe(1800);
  });

  it("starts again on the hour, with a new cycle", () => {
    const before = demoClock(new Date("2026-09-19T14:59:00Z"));
    const after = demoClock(new Date("2026-09-19T15:00:00Z"));

    expect(after.minutes).toBe(STORY_START_MINUTES);
    expect(after.cycleStartedAt.getTime()).toBeGreaterThan(before.cycleStartedAt.getTime());
  });

  it("runs fast enough to watch, but not so fast the board flickers", () => {
    const { speed } = demoClock();
    // A two-hour job should take a few minutes of real time, not seconds.
    expect(120 / speed).toBeGreaterThan(10);
    expect(120 / speed).toBeLessThan(30);
  });
});

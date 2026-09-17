import { describe, expect, it } from "vitest";

import { addDays, dateIn, dayRange, minutesIn, startOfWeek, weekday, zonedTime } from "./dates";

const CHICAGO = "America/Chicago";

describe("zoned dates", () => {
  it("converts a Chicago wall-clock time to the right UTC instant", () => {
    // September is daylight time: UTC-5.
    expect(zonedTime("2026-09-16", 10 * 60 + 30, CHICAGO).toISOString()).toBe("2026-09-16T15:30:00.000Z");
    // January is standard time: UTC-6.
    expect(zonedTime("2026-01-15", 9 * 60, CHICAGO).toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("round-trips an instant back to its local date and minutes", () => {
    const instant = zonedTime("2026-11-02", 7 * 60 + 15, CHICAGO);
    expect(dateIn(instant, CHICAGO)).toBe("2026-11-02");
    expect(minutesIn(instant, CHICAGO)).toBe(7 * 60 + 15);
  });

  it("treats late evening in Chicago as the same local day even though UTC has rolled over", () => {
    const instant = new Date("2026-09-17T03:30:00Z"); // 22:30 on the 16th in Chicago
    expect(dateIn(instant, CHICAGO)).toBe("2026-09-16");
  });

  it("gives a 23-hour day when the clocks go forward", () => {
    const { start, end } = dayRange("2026-03-08", CHICAGO);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(weekday("2026-09-16")).toBe(3);
    expect(startOfWeek("2026-09-16")).toBe("2026-09-14");
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14");
  });
});

import { describe, expect, it } from "vitest";

import { dropStartIn, grabbedAtMinutes, laneUnder, movedFar, type Drag } from "./boardDrag";

const BOARD = { start: 7 * 60, end: 17 * 60, snap: 15 };
const lane = { left: 0, top: 0, width: 1000, height: 64 };

const drag = (over: Partial<Drag> = {}): Drag => ({ jobId: "j-1", minutes: 90, grabbedAt: 0, ...over });

describe("telling a drag from a tap", () => {
  it("ignores the wobble of a finger pressing a button", () => {
    expect(movedFar({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe(false);
  });

  it("counts a deliberate move, in either direction", () => {
    expect(movedFar({ x: 100, y: 100 }, { x: 108, y: 100 })).toBe(true);
    expect(movedFar({ x: 100, y: 100 }, { x: 100, y: 92 })).toBe(true);
  });
});

describe("where a job lands", () => {
  it("puts the middle of the board at noon", () => {
    // 7 AM to 5 PM across 1000px: half way is noon.
    expect(dropStartIn(500, lane, drag(), BOARD)).toBe(12 * 60);
  });

  it("keeps the job under the pointer rather than snapping its start there", () => {
    // Picked up half an hour in, so dropping at noon starts it at 11:30.
    expect(dropStartIn(500, lane, drag({ grabbedAt: 30 }), BOARD)).toBe(11 * 60 + 30);
  });

  it("snaps to the quarter hour, because finer than that is false precision", () => {
    const at = dropStartIn(512, lane, drag(), BOARD);
    expect(at % 15).toBe(0);
  });

  it("will not drop a job before the board starts or past its end", () => {
    expect(dropStartIn(-400, lane, drag(), BOARD)).toBe(BOARD.start);
    // A 90 minute job cannot start later than 90 minutes before closing.
    expect(dropStartIn(99999, lane, drag(), BOARD)).toBe(BOARD.end - 90);
  });

  it("does not produce nonsense from a lane that has not been laid out yet", () => {
    expect(dropStartIn(500, { ...lane, width: 0 }, drag(), BOARD)).toBe(BOARD.start);
  });
});

describe("where the job was picked up", () => {
  it("measures the grab as minutes into the job", () => {
    // A two hour job 200px wide, grabbed a quarter of the way along.
    expect(grabbedAtMinutes(50, { left: 0, top: 0, width: 200, height: 64 }, 120)).toBe(30);
  });

  it("treats an unmeasured block as grabbed at its start", () => {
    expect(grabbedAtMinutes(50, { left: 0, top: 0, width: 0, height: 64 }, 120)).toBe(0);
  });
});

describe("which lane the pointer is over", () => {
  const lanes = (): [string, { getBoundingClientRect(): typeof lane }][] => [
    ["c-ramirez", { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 64 }) }],
    ["c-delgado", { getBoundingClientRect: () => ({ left: 0, top: 100, width: 1000, height: 64 }) }],
    ["c-novak", { getBoundingClientRect: () => ({ left: 0, top: 200, width: 1000, height: 64 }) }],
  ];

  it("finds the lane the finger is actually in", () => {
    expect(laneUnder({ x: 500, y: 130 }, lanes())?.crewId).toBe("c-delgado");
    expect(laneUnder({ x: 500, y: 220 }, lanes())?.crewId).toBe("c-novak");
  });

  it("returns nothing in the gap between two lanes", () => {
    // Dropped on no lane at all, so the job stays where it was.
    expect(laneUnder({ x: 500, y: 80 }, lanes())).toBeNull();
  });

  it("returns nothing off the side of the board", () => {
    expect(laneUnder({ x: 1400, y: 130 }, lanes())).toBeNull();
    expect(laneUnder({ x: -1, y: -1 }, lanes())).toBeNull();
  });
});

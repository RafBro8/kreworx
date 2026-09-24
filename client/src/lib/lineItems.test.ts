import { describe, expect, it } from "vitest";

import type { LineItemInput } from "./api";
import { centsFrom, dollarsFrom, lineTotal, totalOf } from "./lineItems";

const line = (over: Partial<LineItemInput>): LineItemInput => ({
  kind: "part",
  description: "A part",
  quantity: 1,
  unitPriceCents: 0,
  ...over,
});

describe("turning typed money into cents", () => {
  it("takes the ways somebody actually types an amount", () => {
    expect(centsFrom("68")).toBe(6800);
    expect(centsFrom("68.5")).toBe(6850);
    expect(centsFrom("68.50")).toBe(6850);
    expect(centsFrom(" $68.50 ")).toBe(6850);
    expect(centsFrom("0")).toBe(0);
    expect(centsFrom("")).toBeNull();
  });

  it("refuses anything that is not a plain amount", () => {
    expect(centsFrom("68.505")).toBeNull();
    expect(centsFrom("-5")).toBeNull();
    expect(centsFrom("1e3")).toBeNull();
    expect(centsFrom("sixty")).toBeNull();
    expect(centsFrom("68,50")).toBeNull();
  });

  it("survives the amounts that floating point is worst at", () => {
    // 0.1 + 0.2 territory: every one of these has to land on a whole cent.
    for (const [typed, cents] of [
      ["0.07", 7],
      ["1.10", 110],
      ["2.30", 230],
      ["8.20", 820],
      ["1234.56", 123456],
      ["999999.99", 99999999],
    ] as const) {
      expect(centsFrom(typed), typed).toBe(cents);
      expect(Number.isInteger(centsFrom(typed)!), typed).toBe(true);
    }
  });

  it("puts a stored amount back the way it was typed", () => {
    expect(dollarsFrom(6850)).toBe("68.50");
    expect(dollarsFrom(7)).toBe("0.07");
    expect(dollarsFrom(0)).toBe("0.00");
  });
});

describe("what a document adds up to", () => {
  it("multiplies out a fractional quantity without losing a cent", () => {
    expect(lineTotal(line({ quantity: 1.5, unitPriceCents: 11000 }))).toBe(16500);
    // An hour and twenty minutes at $93.50, which does not divide neatly.
    expect(lineTotal(line({ quantity: 1.33, unitPriceCents: 9350 }))).toBe(12436);
    expect(Number.isInteger(lineTotal(line({ quantity: 1.33, unitPriceCents: 9350 })))).toBe(true);
  });

  it("counts a waived line as nothing, while it still shows a price", () => {
    const waived = line({ quantity: 1, unitPriceCents: 8900, waived: true });
    expect(lineTotal(waived)).toBe(0);
    expect(waived.unitPriceCents).toBe(8900);
  });

  it("totals the way the server does", () => {
    const items = [
      line({ quantity: 1, unitPriceCents: 21400 }),
      line({ kind: "labour", quantity: 1.5, unitPriceCents: 11000 }),
      line({ kind: "fee", quantity: 1, unitPriceCents: 8900, waived: true }),
    ];
    // The $379 quote the demo has shown since stage 2.
    expect(totalOf(items)).toBe(37900);
  });
});

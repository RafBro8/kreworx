import { describe, expect, it } from "vitest";

import { renderDocument, type PrintableCompany, type PrintableDocument } from "./render";
import { textOfPdf } from "./text";

const company: PrintableCompany = {
  name: "Northline Mechanical",
  trade: "Heating & cooling",
  licence: "IL-HVAC-44192",
  phone: "(708) 555-0142",
  email: "service@northlinemech.com",
  address: { city: "Mokena", state: "IL" },
};

const quote: PrintableDocument = {
  kind: "quote",
  number: 4471,
  status: "sent",
  findings: "The hot-surface ignitor has a hairline crack.",
  lineItems: [
    { kind: "part", description: "Hot-surface ignitor", quantity: 1, unitPriceCents: 21400 },
    { kind: "labour", description: "Labour - replacement and test", quantity: 1.5, unitPriceCents: 11000 },
    { kind: "fee", description: "Diagnostic visit", quantity: 1, unitPriceCents: 8900, waived: true },
  ],
  issuedLabel: "23 Sep 2026",
  termLabel: "Valid until 7 Oct 2026",
  customer: { name: "Amara Osei" },
  property: { street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448" },
  job: { number: 4471, title: "No heat - priority" },
};

/** The words on the page, as a reader would see them. */
async function textOf(document: PrintableDocument, from: PrintableCompany = company): Promise<string> {
  return textOfPdf(await renderDocument(from, document));
}

describe("the printed document", () => {
  it("is a PDF a reader will open", async () => {
    const bytes = await renderDocument(company, quote);

    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.subarray(-6).toString("ascii")).toContain("%%EOF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("puts the business at the top, with what a customer needs to check it", async () => {
    const text = await textOf(quote);

    expect(text).toContain("Northline Mechanical");
    expect(text).toContain("IL-HVAC-44192");
    expect(text).toContain("(708) 555-0142");
  });

  it("says who and what it is for", async () => {
    const text = await textOf(quote);

    expect(text).toContain("Amara Osei");
    expect(text).toContain("45 Linden Ave");
    expect(text).toContain("No heat - priority");
    expect(text).toContain("Q-4471");
  });

  it("totals the same as every screen does", async () => {
    const text = await textOf(quote);

    // 214.00 + 1.5 x 110.00, with the diagnostic waived: the $379 the portal
    // and the owner's dashboard have shown since stage 2.
    expect(text).toContain("379.00");
    expect(text).toContain("214.00");
    expect(text).toContain("165.00");
  });

  it("shows a waived line, priced, rather than hiding it", async () => {
    const text = await textOf(quote);

    // The customer should see what they were let off.
    expect(text).toContain("Diagnostic visit (waived)");
    expect(text).toContain("89.00");
  });

  it("carries the findings a quote is explained by", async () => {
    const text = await textOf(quote);
    expect(text).toContain("hairline crack");
  });

  it("reads as an invoice when it is one, with no findings", async () => {
    const text = await textOf({
      ...quote,
      kind: "invoice",
      findings: "This should not be printed on an invoice.",
      termLabel: "Due 7 Oct 2026",
    });

    expect(text).toContain("INV-4471");
    expect(text).toContain("Due 7 Oct 2026");
    expect(text).not.toContain("should not be printed");
  });

  it("copes with a business that has filled in almost nothing", async () => {
    const text = await textOf(
      { ...quote, property: null, job: null, findings: null, termLabel: null },
      { name: "Bare Bones Heating" },
    );

    expect(text).toContain("Bare Bones Heating");
    expect(text).toContain("379.00");
  });

  it("does not run a long quote off the bottom of the page", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      kind: "part" as const,
      description: `Replacement part number ${index + 1}, a description long enough to wrap onto a second line`,
      quantity: 2,
      unitPriceCents: 4999,
    }));

    const bytes = await renderDocument(company, { ...quote, lineItems: many });
    const pages = bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];

    // Thirty lines do not fit on one page, so there had better be another.
    expect(pages.length).toBeGreaterThan(1);
  });
});

import { writeFileSync } from "node:fs";

import { renderDocument } from "../pdf/render";

/** Renders a sample quote to a file, for looking at the layout. Dev only. */
async function main() {
  const bytes = await renderDocument(
    {
      name: "Northline Mechanical",
      trade: "Heating & cooling",
      licence: "IL-HVAC-44192",
      phone: "(708) 555-0142",
      email: "service@northlinemech.com",
      address: { city: "Mokena", state: "IL" },
    },
    {
      kind: "quote",
      number: 4471,
      status: "sent",
      findings:
        "The hot-surface ignitor has a hairline crack, so the furnace tries to light, fails, and locks out after three attempts. Everything else - the gas valve, flame sensor and blower - tested normal. Replacing the ignitor should restore heat today.",
      lineItems: [
        { kind: "part", description: "Hot-surface ignitor", detail: "Goodman GMVC96, OEM part", quantity: 1, unitPriceCents: 21400 },
        { kind: "labour", description: "Labour - replacement and test", quantity: 1.5, unitPriceCents: 11000 },
        { kind: "fee", description: "Diagnostic visit", quantity: 1, unitPriceCents: 8900, waived: true },
      ],
      issuedLabel: "23 Sep 2026",
      termLabel: "Valid until 7 Oct 2026",
      customer: { name: "Amara Osei" },
      property: { street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448" },
      job: { number: 4471, title: "No heat - priority" },
    },
  );

  const out = process.argv[2] ?? "sample-quote.pdf";
  writeFileSync(out, bytes);
  console.log(`Wrote ${out}, ${bytes.length} bytes`);
}

void main();

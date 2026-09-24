import PDFDocument from "pdfkit";

import { totalCents, type LineItem } from "../models/lineItems";

/**
 * The printable quote and invoice.
 *
 * This is why the customer surface is a light theme: the quote gets printed,
 * and what is printed has to be the same document the customer read on their
 * phone - the same wording, the same order, the same waived line showing what
 * they were let off. The figures are not recomputed here; they come from
 * `totalCents`, the one function that sums line items everywhere.
 *
 * It is drawn with pdfkit, which is plain JavaScript. The obvious alternative
 * is headless Chrome rendering the web page, which would match the design
 * exactly and pull 300MB of Chromium onto an instance that has neither the
 * disk nor the memory for it.
 */

export type PrintableCompany = {
  name: string;
  trade?: string | null;
  licence?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: { city?: string | null; state?: string | null } | null;
};

export type PrintableDocument = {
  kind: "quote" | "invoice";
  number: number;
  status: string;
  findings?: string | null;
  lineItems: LineItem[];
  /** Already formatted in the company's timezone, because dates are local. */
  issuedLabel: string;
  /** "Valid until 7 Oct" or "Due 7 Oct". */
  termLabel: string | null;
  customer: { name: string };
  property: { street: string; city: string; state: string; zip: string } | null;
  job: { number: number; title: string } | null;
};

/** The customer theme, in print. */
const INK = "#171c22";
const MUTED = "#5b6672";
const FAINT = "#8b95a1";
const LINE = "#dfe4e9";
const ACCENT = "#0f6d86";

const PAGE_MARGIN = 54;
const COLUMNS = { qty: 300, unit: 360, amount: 450 };

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One line's contribution: nothing when waived, exactly as on every screen. */
const lineAmount = (item: LineItem) => (item.waived ? 0 : Math.round(item.quantity * item.unitPriceCents));

export function renderDocument(company: PrintableCompany, document: PrintableDocument): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margin: PAGE_MARGIN,
    info: {
      Title: `${document.kind === "quote" ? "Quote" : "Invoice"} ${label(document)} - ${company.name}`,
      Author: company.name,
    },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  letterhead(doc, company, document);
  parties(doc, company, document);
  if (document.kind === "quote" && document.findings) findings(doc, document.findings);
  lines(doc, document);
  footer(doc, company, document);

  doc.end();
  return finished;
}

export const label = (document: Pick<PrintableDocument, "kind" | "number">) =>
  document.kind === "quote" ? `Q-${document.number}` : `INV-${document.number}`;

function letterhead(doc: PDFKit.PDFDocument, company: PrintableCompany, document: PrintableDocument) {
  const top = doc.y;

  doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(company.name, PAGE_MARGIN, top);

  const contact = [
    company.trade,
    [company.address?.city, company.address?.state].filter(Boolean).join(", ") || null,
    company.phone,
    company.email,
    company.licence ? `Licence ${company.licence}` : null,
  ].filter(Boolean) as string[];

  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  for (const line of contact) doc.text(line, PAGE_MARGIN, doc.y + 1);

  // The document's own name, set against the right margin.
  const right = doc.page.width - PAGE_MARGIN;
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(ACCENT)
    .text(document.kind === "quote" ? "Quote" : "Invoice", right - 200, top, { width: 200, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(label(document), right - 200, doc.y + 2, { width: 200, align: "right" })
    .text(document.issuedLabel, right - 200, doc.y + 1, { width: 200, align: "right" });

  rule(doc, Math.max(doc.y, top + 70) + 10);
}

function parties(doc: PDFKit.PDFDocument, _company: PrintableCompany, document: PrintableDocument) {
  const top = doc.y + 14;

  doc.font("Helvetica").fontSize(8).fillColor(FAINT).text("FOR", PAGE_MARGIN, top, { characterSpacing: 1.1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(document.customer.name, PAGE_MARGIN, doc.y + 2);

  if (document.property) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(document.property.street, PAGE_MARGIN, doc.y + 1)
      .text(`${document.property.city}, ${document.property.state} ${document.property.zip}`, PAGE_MARGIN, doc.y + 1);
  }

  if (document.job) {
    const right = doc.page.width - PAGE_MARGIN;
    doc.font("Helvetica").fontSize(8).fillColor(FAINT).text("WORK", right - 220, top, { width: 220, align: "right", characterSpacing: 1.1 });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`#${document.job.number} ${document.job.title}`, right - 220, doc.y + 2, { width: 220, align: "right" });
  }

  doc.y = Math.max(doc.y, top + 54);
}

function findings(doc: PDFKit.PDFDocument, text: string) {
  doc.y += 16;
  doc.font("Helvetica").fontSize(8).fillColor(FAINT).text("WHAT WE FOUND", PAGE_MARGIN, doc.y, { characterSpacing: 1.1 });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(INK)
    .text(text, PAGE_MARGIN, doc.y + 4, { width: doc.page.width - PAGE_MARGIN * 2, lineGap: 2.5 });
}

function lines(doc: PDFKit.PDFDocument, document: PrintableDocument) {
  doc.y += 20;

  const header = doc.y;
  doc.font("Helvetica").fontSize(8).fillColor(FAINT);
  doc.text("DESCRIPTION", PAGE_MARGIN, header, { characterSpacing: 1.1 });
  doc.text("QTY", COLUMNS.qty, header, { width: 44, align: "right", characterSpacing: 1.1 });
  doc.text("UNIT", COLUMNS.unit, header, { width: 70, align: "right", characterSpacing: 1.1 });
  doc.text("AMOUNT", COLUMNS.amount, header, { width: 78, align: "right", characterSpacing: 1.1 });
  rule(doc, header + 13);

  for (const item of document.lineItems) {
    const row = doc.y + 8;
    // A waived line is greyed rather than hidden: the customer should see what
    // they are being let off, which is the whole point of waiving it.
    const colour = item.waived ? MUTED : INK;

    doc.font("Helvetica").fontSize(10).fillColor(colour);
    doc.text(item.waived ? `${item.description} (waived)` : item.description, PAGE_MARGIN, row, { width: 230 });
    const descriptionBottom = doc.y;

    if (item.detail) {
      doc.font("Helvetica").fontSize(8.5).fillColor(FAINT).text(item.detail, PAGE_MARGIN, doc.y + 1, { width: 230 });
    }

    doc.font("Helvetica").fontSize(10).fillColor(colour);
    doc.text(trimNumber(item.quantity), COLUMNS.qty, row, { width: 44, align: "right" });
    doc.text(money(item.unitPriceCents), COLUMNS.unit, row, { width: 70, align: "right" });
    doc.text(money(lineAmount(item)), COLUMNS.amount, row, { width: 78, align: "right" });

    doc.y = Math.max(doc.y, descriptionBottom) + 6;
    rule(doc, doc.y);
  }

  const total = doc.y + 12;
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("Total", COLUMNS.unit, total, { width: 70, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(INK)
    .text(money(totalCents(document.lineItems)), COLUMNS.amount, total - 3, { width: 78, align: "right" });
  doc.y = total + 26;
}

function footer(doc: PDFKit.PDFDocument, company: PrintableCompany, document: PrintableDocument) {
  const note =
    document.kind === "quote"
      ? "Approve this quote from the link in your message, or call and we will take your go-ahead over the phone."
      : "Thank you for your business.";

  if (document.termLabel) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(document.termLabel, PAGE_MARGIN, doc.y);
  }
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(note, PAGE_MARGIN, doc.y + 4, { width: doc.page.width - PAGE_MARGIN * 2 });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(FAINT)
    .text(
      [company.name, company.phone].filter(Boolean).join(" · "),
      PAGE_MARGIN,
      doc.page.height - PAGE_MARGIN - 12,
      { width: doc.page.width - PAGE_MARGIN * 2, align: "center" },
    );
}

function rule(doc: PDFKit.PDFDocument, at: number) {
  doc
    .moveTo(PAGE_MARGIN, at)
    .lineTo(doc.page.width - PAGE_MARGIN, at)
    .lineWidth(0.5)
    .strokeColor(LINE)
    .stroke();
  doc.y = at;
}

/** "1.5" stays, "1" does not become "1.00" - quantities are counts and hours. */
function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

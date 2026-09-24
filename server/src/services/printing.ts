import type { Response } from "express";
import type { Types } from "mongoose";

import { shortDateIn } from "../lib/dates";
import { Company, Customer, Job, Property } from "../models";
import type { LineItem } from "../models/lineItems";
import { label, renderDocument, type PrintableDocument } from "../pdf/render";

/**
 * Gathering everything a printed document needs, once, for both the office and
 * the customer. The two routes differ in who is allowed to ask; what comes out
 * is the same document, so it is built in one place.
 */

type Stored = {
  number: number;
  status: string;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  lineItems: LineItem[];
  findings?: string | null;
  sentAt?: Date | null;
  validUntil?: Date | null;
  issuedAt?: Date;
  dueAt?: Date;
};

export async function printableFrom(kind: "quote" | "invoice", stored: Stored, companyId: Types.ObjectId) {
  const [company, customer, job] = await Promise.all([
    Company.findById(companyId).lean(),
    Customer.findById(stored.customerId, { name: 1 }).lean(),
    Job.findById(stored.jobId, { number: 1, title: 1, propertyId: 1 }).lean(),
  ]);
  if (!company) throw new Error("A document without a company cannot be printed");

  const property = job ? await Property.findById(job.propertyId, { street: 1, city: 1, state: 1, zip: 1 }).lean() : null;
  const zone = company.timezone;

  const issued = kind === "quote" ? (stored.sentAt ?? new Date()) : (stored.issuedAt ?? new Date());
  const term = kind === "quote" ? stored.validUntil : stored.dueAt;

  const document: PrintableDocument = {
    kind,
    number: stored.number,
    status: stored.status,
    findings: stored.findings ?? null,
    lineItems: stored.lineItems,
    issuedLabel: shortDateIn(issued, zone),
    termLabel: term ? `${kind === "quote" ? "Valid until" : "Due"} ${shortDateIn(term, zone)}` : null,
    customer: { name: customer?.name ?? "Customer" },
    property: property
      ? { street: property.street, city: property.city, state: property.state, zip: property.zip }
      : null,
    job: job ? { number: job.number, title: job.title } : null,
  };

  return { company, document };
}

/**
 * A PDF is a file somebody saves, so it goes out as an attachment with a name
 * they will recognise on their desktop rather than a string of hex.
 */
export async function sendPdf(res: Response, kind: "quote" | "invoice", stored: Stored, companyId: Types.ObjectId) {
  const { company, document } = await printableFrom(kind, stored, companyId);
  const bytes = await renderDocument(company, document);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(bytes.length),
    "Content-Disposition": `attachment; filename="${label(document)}.pdf"`,
    // Money on paper, behind a link: not for any cache in between.
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  });
  res.end(bytes);
}

import { Company } from "./Company";
import { Counter } from "./Counter";
import { Crew } from "./Crew";
import { Customer } from "./Customer";
import { Invoice } from "./Invoice";
import { Job } from "./Job";
import { Property } from "./Property";
import { Quote } from "./Quote";
import { User } from "./User";

export { Company, Counter, Crew, Customer, Invoice, Job, Property, Quote, User };

const models = [Company, User, Crew, Customer, Property, Job, Quote, Invoice, Counter];

/**
 * autoIndex is off, so indexes are built here at startup and awaited. A
 * conflict with an existing index throws and stops the server instead of
 * being logged and forgotten: a missing unique index on job numbers or portal
 * tokens is not something to discover in production.
 */
export async function ensureIndexes(): Promise<void> {
  for (const model of models) {
    await model.createIndexes();
  }
}

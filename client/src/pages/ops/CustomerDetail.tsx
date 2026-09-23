import { Link, useParams } from "react-router";

import { useMe } from "../../auth/context";
import { PhoneIcon } from "../../components/icons";
import { Card, Eyebrow, StatusPill } from "../../components/ui";
import { getCustomer } from "../../lib/api";
import { money, shortDate, STATUS } from "../../lib/format";
import { useApi } from "../../lib/useApi";

/**
 * One customer: who they are, what they own, and everything done for them.
 *
 * This is the page the placeholder promised - "so the technician who arrives
 * next year knows what the last one found". The access notes and the equipment
 * list are the part that earns its keep: a gate code and a model number save a
 * phone call from a driveway.
 */
export default function CustomerDetail() {
  const { id = "" } = useParams();
  const me = useMe();
  const customer = useApi(() => getCustomer(id), id);
  const tz = me.company.timezone;

  if (customer.status === "loading") {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>;
  }

  if (customer.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-blocked">
          {customer.httpStatus === 404 ? "There is no customer at that address." : customer.message}
        </p>
        <Link to="/customers" className="text-[13px] text-accent">
          Back to customers
        </Link>
      </div>
    );
  }

  const { data } = customer;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/customers" className="w-fit text-[12.5px] text-ink-muted hover:text-ink">
        ← Customers
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">{data.name}</h1>
          <span className="text-[13px] text-ink-muted capitalize">{data.kind}</span>
        </div>
        <div className="flex items-center gap-4">
          {data.phone ? (
            <a href={`tel:${data.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-[13px] text-accent">
              <PhoneIcon size={15} />
              {data.phone}
            </a>
          ) : null}
          <div className="flex flex-col items-end gap-0.5">
            <Eyebrow>Billed to date</Eyebrow>
            <span className="font-display text-[20px] leading-none font-bold">{money(data.billedCents)}</span>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2.5">
        <Eyebrow>{data.properties.length === 1 ? "Property" : "Properties"}</Eyebrow>
        <div className="grid gap-3 md:grid-cols-2">
          {data.properties.map((property) => (
            <Card key={property.id}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-medium">{property.street}</span>
                  <span className="text-[12.5px] text-ink-muted">
                    {property.city}, {property.state} {property.zip}
                  </span>
                </div>

                {property.equipment.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {property.equipment.map((item, index) => (
                      <li key={index} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span>{item.kind}</span>
                        <span className="text-right text-ink-muted">
                          {[item.make, item.model].filter(Boolean).join(" ")}
                          {item.installedYear ? ` · ${item.installedYear}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {property.accessNotes ? (
                  <p className="rounded-tile bg-raised px-3 py-2 text-[12.5px] text-ink-muted">{property.accessNotes}</p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <Eyebrow>History</Eyebrow>
        {data.jobs.length === 0 ? (
          <Card>
            <p className="text-[13.5px] text-ink-muted">Nothing booked yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul aria-label="Job history">
              {data.jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                    <span className="font-mono text-[11.5px] text-ink-faint">#{job.number}</span>
                    <span className="text-[13.5px]">{job.title}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <StatusPill tone={STATUS[job.status].tone}>{STATUS[job.status].label}</StatusPill>
                    <span className="font-mono text-[12px] whitespace-nowrap text-ink-faint">
                      {shortDate(job.scheduledStart ?? job.requestedAt, tz)}
                    </span>
                    <span className="ml-auto w-24 text-right font-mono text-[12.5px] sm:ml-0">
                      {job.invoice ? money(job.invoice.totalCents) : job.quote ? `${money(job.quote.totalCents)} quoted` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

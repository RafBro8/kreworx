import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Card, Eyebrow } from "../../components/ui";
import { getCustomers } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useMe } from "../../auth/context";

/**
 * Everyone the business works for.
 *
 * The search runs on the server and the term lives in the URL, so a particular
 * search can be sent to somebody else or come back with the back button. It is
 * debounced because the office types a name, not a query - firing a request per
 * keystroke would be four requests to find one person.
 */
export default function Customers() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [typed, setTyped] = useState(query);

  // The box is the source of truth while somebody is typing; the URL catches
  // up a moment later, which is also what triggers the fetch.
  useEffect(() => {
    if (typed === query) return;
    const timer = setTimeout(() => {
      setParams(typed ? { q: typed } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [typed, query, setParams]);

  const customers = useApi(() => getCustomers(query || undefined), query);
  const rows = customers.status === "ready" ? customers.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">Customers</h1>
          <span className="text-[13px] text-ink-muted">{me.company.name}</span>
        </div>
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search by name or town"
          aria-label="Search customers"
          className="h-10 w-full max-w-xs rounded-control border border-border bg-surface px-3 text-[13.5px] placeholder:text-ink-faint"
        />
      </div>

      {customers.status === "error" ? (
        <p role="alert" className="text-sm text-blocked">
          {customers.message}
        </p>
      ) : null}

      {customers.status === "ready" && rows.length === 0 ? (
        <Card>
          <p className="text-[13.5px] text-ink-muted">
            {query ? `Nobody matches "${query}".` : "No customers yet."}
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <Th>Customer</Th>
                <Th className="hidden sm:table-cell">Where</Th>
                <Th align="right" className="hidden lg:table-cell">Jobs</Th>
                <Th className="hidden md:table-cell">Last visit</Th>
                <Th align="right">Billed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} className="border-b border-line last:border-0 hover:bg-raised">
                  <td className="px-4 py-3">
                    <Link to={`/customers/${customer.id}`} className="flex flex-col gap-0.5 text-balance">
                      <span className="text-[13.5px] font-medium">{customer.name}</span>
                      <span className="text-[12px] text-ink-faint capitalize">{customer.kind}</span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-[13px] text-ink-muted sm:table-cell">
                    {customer.towns.join(", ") || "-"}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-[13px] text-ink-muted lg:table-cell">
                    {customer.jobs}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-[12.5px] text-ink-muted md:table-cell">
                    {customer.lastVisit ? shortDate(customer.lastVisit, me.company.timezone) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px]">{money(customer.billedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th scope="col" className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"} font-normal ${className}`}>
      <Eyebrow>{children}</Eyebrow>
    </th>
  );
}

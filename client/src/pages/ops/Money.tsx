import { Link } from "react-router";

import { useMe } from "../../auth/context";
import { Card, Eyebrow, StatusPill } from "../../components/ui";
import { getMoney, type MoneyRow } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useLive } from "../../lib/useLive";

const TONE: Record<string, "quiet" | "waiting" | "done" | "blocked"> = {
  draft: "quiet",
  sent: "waiting",
  approved: "done",
  declined: "blocked",
  paid: "done",
  overdue: "blocked",
};

/**
 * The paperwork, both kinds side by side.
 *
 * An owner opening this wants two numbers before anything else: what is
 * waiting on a customer's answer, and what has been billed but not paid. Those
 * are the ones at the top; the lists underneath are how you go and do
 * something about them.
 */
export default function Money() {
  const me = useMe();
  const book = useApi(getMoney);
  const { reload } = book;

  // Somebody approving a quote from their phone should land here without a
  // refresh - it is the same event the board listens to.
  useLive({
    onBoardChanged: (event) => {
      if (event.reason === "quote" || event.reason === "invoice" || event.reason === "demo-reset") reload();
    },
  });

  if (book.status === "error") {
    return (
      <p role="alert" className="text-sm text-blocked">
        {book.message}
      </p>
    );
  }

  const quotes = book.status === "ready" ? book.data.quotes : [];
  const invoices = book.status === "ready" ? book.data.invoices : [];
  // The lists are trimmed to the most recent settled paperwork, so the two
  // headlines come from the server, which counted all of it.
  const totals = book.status === "ready" ? book.data.totals : null;
  const settledShown = book.status === "ready" ? book.data.settledShown : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">Quotes and invoices</h1>
        <span className="text-[13px] text-ink-muted">{me.company.name}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Headline label="Waiting on an answer" count={totals?.awaiting.count ?? 0} cents={totals?.awaiting.cents ?? 0} />
        <Headline label="Billed and unpaid" count={totals?.unpaid.count ?? 0} cents={totals?.unpaid.cents ?? 0} />
      </div>

      <Section
        title="Quotes"
        rows={quotes}
        empty="No quotes yet."
        href={(row) => `/money/quotes/${row.id}`}
        timezone={me.company.timezone}
        dateOf={(row) => row.sentAt}
        note={`Open quotes, then the last ${settledShown} answered.`}
      />
      <Section
        title="Invoices"
        rows={invoices}
        empty="Nothing invoiced yet."
        href={(row) => `/money/invoices/${row.id}`}
        timezone={me.company.timezone}
        dateOf={(row) => row.issuedAt}
        note={`Everything unpaid, then the last ${settledShown} settled.`}
      />

    </div>
  );
}

function Headline({ label, count, cents }: { label: string; count: number; cents: number }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-display text-[30px] leading-none font-bold tracking-[-0.03em]">{money(cents)}</span>
      <span className="text-[12.5px] text-ink-muted">
        {count} {count === 1 ? "document" : "documents"}
      </span>
    </Card>
  );
}

function Section({
  title,
  rows,
  empty,
  href,
  timezone,
  dateOf,
  note,
}: {
  title: string;
  rows: MoneyRow[];
  empty: string;
  href: (row: MoneyRow) => string;
  timezone: string;
  dateOf: (row: MoneyRow) => string | null;
  note?: string;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <Eyebrow>{title}</Eyebrow>
        {note && rows.length > 0 ? <span className="text-[12px] text-ink-faint">{note}</span> : null}
      </div>
      {rows.length === 0 ? (
        <Card>
          <p className="text-[13.5px] text-ink-muted">{empty}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul aria-label={title}>
            {rows.map((row) => (
              <li key={row.id} className="border-b border-line last:border-0">
                <Link
                  to={href(row)}
                  className="flex flex-col gap-2 px-4 py-3 hover:bg-raised sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13.5px]">{row.customer ?? "Unknown customer"}</span>
                    <span className="truncate text-[12px] text-ink-faint">
                      {row.job ? `#${row.job.number} ${row.job.title}` : "No job"}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <StatusPill tone={TONE[row.status] ?? "quiet"}>{row.status}</StatusPill>
                    <span className="font-mono text-[12px] whitespace-nowrap text-ink-faint">
                      {(() => {
                        const when = dateOf(row);
                        return when ? shortDate(when, timezone) : "-";
                      })()}
                    </span>
                    <span className="ml-auto shrink-0 text-right font-mono tabular-nums text-[13px] sm:ml-0 sm:w-24">{money(row.totalCents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

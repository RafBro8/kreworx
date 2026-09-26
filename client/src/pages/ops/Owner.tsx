import { useState } from "react";
import { Link } from "react-router";

import { useMe } from "../../auth/context";
import { Card, Eyebrow, Stat, StatusPill } from "../../components/ui";
import { getHealth, getOwnerMoney, getOwnerSummary, resetDemo, type OwnerMoney } from "../../lib/api";
import { money, moneyRounded } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import RevenueChart from "./RevenueChart";

export default function Owner() {
  const me = useMe();
  const summary = useApi(getOwnerSummary);
  const books = useApi(getOwnerMoney);
  const health = useApi(getHealth);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {summary.status === "loading" ? (
          <p className="text-sm text-ink-muted">Adding up the morning…</p>
        ) : summary.status === "error" ? (
          <p className="text-sm text-blocked" role="alert">
            {summary.message}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Jobs today" value={String(summary.data.jobsToday)} note={`${summary.data.doneToday} done so far`} />
            <Stat
              label="Invoiced today"
              value={moneyRounded(summary.data.invoicedTodayCents)}
              note={`${moneyRounded(summary.data.invoicedThisWeekCents)} this week`}
            />
            <Stat
              label="Quotes awaiting"
              value={String(summary.data.quotesAwaiting.count)}
              note={`${money(summary.data.quotesAwaiting.totalCents)} waiting on customers`}
            />
            <Stat
              label="Completion"
              value={summary.data.jobsToday ? `${Math.round((summary.data.doneToday / summary.data.jobsToday) * 100)}%` : "-"}
              note="Of today's booked work"
            />
          </div>
        )}
      </Card>

      {books.status === "ready" ? <Books books={books.data} /> : null}
      {books.status === "error" ? (
        <p role="alert" className="text-sm text-blocked">
          {books.message}
        </p>
      ) : null}

      {me.company.isDemo ? <ResetDemo onReset={summary.reload} /> : null}

      <Card>
        <div className="flex flex-col gap-3">
          <Eyebrow>Deployment</Eyebrow>
          {health.status === "loading" ? (
            <span className="text-sm text-ink-muted">Checking the API…</span>
          ) : health.status === "error" ? (
            <span className="text-sm text-blocked">{health.message}</span>
          ) : (
            <dl className="grid gap-3 font-mono text-[13px] sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">API</dt>
                <dd>{health.data.status}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">Commit</dt>
                <dd>{health.data.commit ?? "local"}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">Database</dt>
                <dd>{health.data.database.connected ? (health.data.database.name ?? "connected") : "down"}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * The books: what came in, what has not, and what is still out with a customer.
 *
 * Three questions in the order an owner asks them on a Friday afternoon.
 */
function Books({ books }: { books: OwnerMoney }) {
  const { receivable, pipeline } = books;
  const rate = pipeline.answered > 0 ? Math.round((pipeline.won.count / pipeline.answered) * 100) : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <Eyebrow>Money in</Eyebrow>
          <span className="text-[12.5px] text-ink-muted">The last {books.weeks.length} weeks</span>
        </div>
        <RevenueChart weeks={books.weeks} />
      </Card>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Eyebrow>Owed to you</Eyebrow>
            <span className="font-display text-[22px] leading-none font-bold tracking-[-0.02em]">
              {moneyRounded(receivable.totalCents)}
            </span>
          </div>

          <Ageing ageing={receivable.ageing} totalCents={receivable.totalCents} />

          {receivable.oldest.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] text-ink-muted">Longest outstanding - the calls to make first</span>
              <ul className="flex flex-col" aria-label="Longest outstanding">
                {receivable.oldest.map((invoice) => (
                  <li key={invoice.id} className="border-b border-line last:border-0">
                    {/* Who and how much on the first line, because those are
                        what you need to make the call; how late it is underneath.
                        On a wider screen it is all one row. */}
                    <Link
                      to={`/money/invoices/${invoice.id}`}
                      className="flex flex-col gap-1 py-2 hover:text-accent sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="flex items-baseline gap-3 sm:min-w-0 sm:flex-1">
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {invoice.customer ?? "Unknown customer"}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-[13px] sm:hidden">
                          {money(invoice.totalCents)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5 sm:gap-3">
                        {invoice.overdue ? <StatusPill tone="blocked">overdue</StatusPill> : null}
                        <span className="font-mono text-[12px] whitespace-nowrap text-ink-faint sm:w-16 sm:text-right">
                          {invoice.daysOld} days
                        </span>
                        <span className="hidden w-[74px] shrink-0 text-right font-mono tabular-nums text-[13px] sm:inline">
                          {money(invoice.totalCents)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Nothing outstanding. Everything billed has been paid.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <Eyebrow>Out with customers</Eyebrow>
          <Stat
            label="Quotes waiting on an answer"
            value={moneyRounded(pipeline.out.cents)}
            note={`${pipeline.out.count} ${pipeline.out.count === 1 ? "quote" : "quotes"}`}
          />
          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <Eyebrow>Answered in {pipeline.weeks} weeks</Eyebrow>
            <span className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">
              {rate === null ? "-" : `${rate}%`}
            </span>
            <span className="text-[12.5px] text-ink-muted">
              {rate === null
                ? "No quotes answered yet."
                : `${pipeline.won.count} of ${pipeline.answered} approved, worth ${moneyRounded(pipeline.won.cents)}`}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Three age bands as one bar. The ramp runs light to dark with the age. */
function Ageing({ ageing, totalCents }: { ageing: OwnerMoney["receivable"]["ageing"]; totalCents: number }) {
  const shade = ["var(--chart-age-1)", "var(--chart-age-2)", "var(--chart-age-3)"];

  return (
    <div className="flex flex-col gap-2.5">
      {totalCents > 0 ? (
        <div className="flex h-2.5 gap-0.5 overflow-hidden" aria-hidden>
          {ageing.map((bucket, index) => (
            <span
              key={bucket.key}
              className="first:rounded-l-full last:rounded-r-full"
              style={{ background: shade[index], width: `${(bucket.cents / totalCents) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        {ageing.map((bucket, index) => (
          <div
            key={bucket.key}
            className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-1"
          >
            <dt className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-ink-muted">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: shade[index] }} />
              {bucket.label}
            </dt>
            <dd className="flex flex-col items-end gap-0.5 sm:items-stretch">
              <span className="font-mono tabular-nums text-[15px]">{moneyRounded(bucket.cents)}</span>
              <span className="text-[11.5px] whitespace-nowrap text-ink-faint">
                {bucket.count} {bucket.count === 1 ? "invoice" : "invoices"}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The demo is one shared business, so whatever a visitor drags around is what
 * the next person sees. This puts it back to this morning without waiting for
 * the nightly rebuild. Two steps, because it throws away anyone else's changes
 * as well.
 */
function ResetDemo({ onReset }: { onReset: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await resetDemo();
      setDoneAt(new Date().toLocaleTimeString());
      setAsking(false);
      onReset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not reset the demo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Eyebrow>Demo</Eyebrow>
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-muted">
          Everyone trying Kreworx shares this one business, so jobs other people moved or cancelled stay moved.
          Resetting rebuilds today from scratch - the same thing that happens on its own each morning.
        </p>

        {asking ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink">Reset now? Any changes made by anyone are lost.</span>
            <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-control bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink disabled:opacity-50">
              {busy ? "Rebuilding…" : "Yes, reset it"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className="rounded-control border border-border px-3.5 py-2 text-[13px] text-ink-muted hover:text-ink">
              Keep it as it is
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setAsking(true)} className="w-fit rounded-control border border-border px-3.5 py-2 text-[13px] text-ink-muted hover:text-ink">
              Reset the demo
            </button>
            {doneAt ? <span className="text-[13px] text-done">Rebuilt at {doneAt}</span> : null}
          </div>
        )}

        {error ? (
          <p className="text-[13px] text-blocked" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

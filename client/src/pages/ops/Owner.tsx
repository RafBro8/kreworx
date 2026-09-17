import { Card, ComingUp, Eyebrow, Stat } from "../../components/ui";
import { getHealth, getOwnerSummary } from "../../lib/api";
import { money, moneyRounded } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export default function Owner() {
  const summary = useApi(getOwnerSummary);
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
              value={summary.data.jobsToday ? `${Math.round((summary.data.doneToday / summary.data.jobsToday) * 100)}%` : "—"}
              note="Of today's booked work"
            />
          </div>
        )}
      </Card>

      <ComingUp title="The owner's morning read" stage="Stage 7">
        Revenue over time, jobs won and lost, first-time fix rate, and which crew is running behind — the page an
        owner checks with coffee before the trucks leave.
      </ComingUp>

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

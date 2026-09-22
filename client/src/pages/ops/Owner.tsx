import { useState } from "react";

import { useMe } from "../../auth/context";
import { Card, ComingUp, Eyebrow, Stat } from "../../components/ui";
import { getHealth, getOwnerSummary, resetDemo } from "../../lib/api";
import { money, moneyRounded } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export default function Owner() {
  const me = useMe();
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
              value={summary.data.jobsToday ? `${Math.round((summary.data.doneToday / summary.data.jobsToday) * 100)}%` : "-"}
              note="Of today's booked work"
            />
          </div>
        )}
      </Card>

      <ComingUp title="The owner's morning read" stage="Stage 7">
        Revenue over time, jobs won and lost, first-time fix rate, and which crew is running behind - the page an
        owner checks with coffee before the trucks leave.
      </ComingUp>

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

import { Card, ComingUp, Eyebrow, Stat } from "../../components/ui";
import { useHealth } from "../../lib/useHealth";

export default function Owner() {
  const state = useHealth();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="grid gap-6 sm:grid-cols-4">
          <Stat label="Booked today" value="—" note="Arrives with the schedule" />
          <Stat label="Completed" value="—" note="Arrives with the schedule" />
          <Stat label="Awaiting approval" value="—" note="Arrives with quotes" />
          <Stat label="Invoiced this week" value="—" note="Arrives with invoices" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <Eyebrow>Deployment</Eyebrow>
          {state.status === "loading" ? (
            <span className="text-sm text-ink-muted">Checking the API…</span>
          ) : state.status === "error" ? (
            <span className="text-sm text-blocked">{state.message}</span>
          ) : (
            <dl className="grid gap-3 font-mono text-[13px] sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">API</dt>
                <dd>{state.health.status}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">Commit</dt>
                <dd>{state.health.commit ?? "local"}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-ink-faint">Database</dt>
                <dd>{state.health.database.connected ? (state.health.database.name ?? "connected") : "down"}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>

      <ComingUp title="The owner's morning read" stage="Stage 7">
        Revenue, jobs won and lost, first-time fix rate, and which crew is running behind —
        the page an owner checks with coffee before the trucks leave.
      </ComingUp>
    </div>
  );
}

import { Link } from "react-router";

import { useMe } from "../../auth/context";
import { Card, StatusPill } from "../../components/ui";
import { getJobs, type JobSummary } from "../../lib/api";
import { clockFromMinutes, dateInZone, longDate, minutesOfDay, STATUS, timeRange } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useDemoMinutes } from "../../lib/useDemoClock";
import { useLive } from "../../lib/useLive";

/**
 * A technician's day.
 *
 * Not the dispatcher's board with the controls removed: that is a wall chart,
 * ten hours wide, and this is read on a phone in somebody's driveway between
 * two calls. So it runs top to bottom, the next stop is the biggest thing on
 * the screen, and everything is a thumb's width.
 */

/** Work that is neither finished nor called off is still ahead of you. */
const AHEAD = (job: JobSummary) => job.status !== "done" && job.status !== "cancelled";

export default function MyDay() {
  const me = useMe();
  const day = useApi(() => getJobs());
  const demoMinutes = useDemoMinutes(day.status === "ready" ? day.data.demo : null);

  const { reload } = day;
  useLive({ onBoardChanged: () => reload() });

  if (day.status === "loading") return <p className="text-sm text-ink-muted">Loading your day…</p>;
  if (day.status === "error") {
    return (
      <p role="alert" className="text-sm text-blocked">
        {day.message}
      </p>
    );
  }

  const { jobs, timezone, date } = day.data;
  const inOrder = [...jobs].sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
  const ahead = inOrder.filter(AHEAD);
  const next = ahead[0] ?? null;
  const rest = ahead.slice(1);
  const finished = inOrder.filter((job) => job.status === "done");
  const isToday = date === dateInZone(new Date(), timezone);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">
            {isToday ? "Today" : longDate(date)}
          </h1>
          <span className="text-[13px] text-ink-muted">
            {me.user.name} · {finished.length} of {inOrder.length} done
          </span>
        </div>
        {isToday && demoMinutes !== null ? (
          <span
            className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent"
            title="The demo day runs fast so you can watch it move. It restarts every hour."
          >
            Demo clock {clockFromMinutes(demoMinutes)}
          </span>
        ) : null}
      </div>

      {next ? <NextStop job={next} timezone={timezone} demoMinutes={demoMinutes} /> : null}

      {rest.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-mono text-[10.5px] font-medium tracking-[0.12em] text-ink-faint uppercase">
            After that
          </h2>
          <ul className="flex flex-col gap-2" aria-label="Later stops">
            {rest.map((job) => (
              <li key={job.id}>
                <StopRow job={job} timezone={timezone} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-mono text-[10.5px] font-medium tracking-[0.12em] text-ink-faint uppercase">Done</h2>
          <ul className="flex flex-col gap-2" aria-label="Finished stops">
            {finished.map((job) => (
              <li key={job.id}>
                <StopRow job={job} timezone={timezone} muted />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inOrder.length === 0 ? (
        <Card>
          <p className="text-[13.5px] text-ink-muted">Nothing booked for you today.</p>
        </Card>
      ) : null}

      {ahead.length === 0 && inOrder.length > 0 ? (
        <Card>
          <p className="text-[13.5px] text-ink-muted">That is the lot. Nothing else booked today.</p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The stop being driven to, or stood in. Deliberately the largest thing here -
 * it is the only one that matters while the van is moving.
 */
function NextStop({
  job,
  timezone,
  demoMinutes,
}: {
  job: JobSummary;
  timezone: string;
  demoMinutes: number | null;
}) {
  const { label, tone } = STATUS[job.status];
  const away =
    demoMinutes !== null && job.scheduledStart
      ? Math.round(minutesOfDay(job.scheduledStart, timezone) - demoMinutes)
      : null;

  return (
    <Link
      to={`/my-day/${job.id}`}
      className="rounded-card border border-accent-line bg-accent-soft/40 p-4 transition-colors hover:border-accent"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10.5px] font-medium tracking-[0.12em] text-accent uppercase">
            Next stop
          </span>
          <StatusPill tone={tone}>{label}</StatusPill>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{job.title}</span>
          <span className="text-[14px] text-ink-muted">{job.customer?.name}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[14px]">{job.address?.street}</span>
          <span className="text-[13px] text-ink-muted">{job.address?.city}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-ink-faint">
          {job.scheduledStart && job.scheduledEnd ? (
            <span>{timeRange(job.scheduledStart, job.scheduledEnd, timezone)}</span>
          ) : (
            <span>Not scheduled</span>
          )}
          {away !== null && away > 0 ? <span className="text-accent">starts in {away} min</span> : null}
          {away !== null && away <= 0 && job.status !== "on_site" ? (
            <span className="text-waiting">due now</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function StopRow({ job, timezone, muted = false }: { job: JobSummary; timezone: string; muted?: boolean }) {
  const { label, tone } = STATUS[job.status];

  return (
    <Link
      to={`/my-day/${job.id}`}
      className={`flex rounded-tile border border-border bg-surface px-3.5 py-3 hover:border-accent-line ${
        muted ? "opacity-60" : ""
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-ink-faint">
            {job.scheduledStart && job.scheduledEnd
              ? timeRange(job.scheduledStart, job.scheduledEnd, timezone).split(" - ")[0]
              : "-"}
          </span>
          <StatusPill tone={tone}>{label}</StatusPill>
        </span>
        <span className="truncate text-[14px]">{job.title}</span>
        <span className="truncate text-[12.5px] text-ink-muted">
          {job.customer?.name} · {job.address?.street}
        </span>
      </span>
    </Link>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router";

import { useMe } from "../../auth/context";
import { PhoneIcon } from "../../components/icons";
import JobPhotos from "../../components/JobPhotos";
import { Card, Eyebrow, StatusPill } from "../../components/ui";
import { changeJobStatus, getJob, type JobDetail, type JobStatus } from "../../lib/api";
import { shortDate, STATUS, STATUS_ACTION, timeRange } from "../../lib/format";
import { useApi } from "../../lib/useApi";

/**
 * One stop, on a phone.
 *
 * The order is the order a technician needs it in: where am I going, how do I
 * get in, what is here, then what I do about it. The access notes sit near the
 * top because a gate code is the difference between starting the job and
 * ringing the office from the kerb.
 */
export default function Stop() {
  const { id = "" } = useParams();
  const me = useMe();
  const [version, setVersion] = useState(0);
  const job = useApi(() => getJob(id), `${id}:${version}`);
  const tz = me.company.timezone;

  if (job.status === "loading") return <p className="text-sm text-ink-muted">Loading…</p>;

  if (job.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-blocked">
          {job.httpStatus === 404 ? "That job is not on your list." : job.message}
        </p>
        <Link to="/my-day" className="text-[13px] text-accent">
          Back to my day
        </Link>
      </div>
    );
  }

  const stop = job.data;
  const { label, tone } = STATUS[stop.status];
  const address = stop.property
    ? `${stop.property.street}, ${stop.property.city}, ${stop.property.state} ${stop.property.zip}`
    : null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Link to="/my-day" className="w-fit text-[13px] text-ink-muted hover:text-ink">
        ← My day
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={tone}>{label}</StatusPill>
          {stop.priority !== "normal" ? <StatusPill tone="blocked">{stop.priority}</StatusPill> : null}
          <span className="font-mono text-[11.5px] text-ink-faint">#{stop.number}</span>
        </div>
        <h1 className="font-display text-[24px] leading-tight font-bold tracking-[-0.02em]">{stop.title}</h1>
        <span className="text-[14px] text-ink-muted">
          {stop.scheduledStart && stop.scheduledEnd
            ? `${shortDate(stop.scheduledStart, tz)} · ${timeRange(stop.scheduledStart, stop.scheduledEnd, tz)}`
            : "Not scheduled"}
        </span>
      </div>

      {/* Where, and how to get there. Both are one tap: the phone's own map and
          the phone's own dialler, because neither belongs in this app. */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-medium">{stop.property?.street}</span>
          <span className="text-[13.5px] text-ink-muted">
            {stop.property?.city}, {stop.property?.state} {stop.property?.zip}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {address ? (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center rounded-control bg-accent px-4 text-[14px] font-medium whitespace-nowrap text-accent-ink"
            >
              Directions
            </a>
          ) : null}
          {stop.customer?.phone ? (
            <a
              href={`tel:${stop.customer.phone.replace(/[^\d+]/g, "")}`}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-border px-3.5 text-[14px] whitespace-nowrap text-ink"
            >
              <PhoneIcon size={16} />
              Call {stop.customer.name.split(" ")[0]}
            </a>
          ) : null}
        </div>
      </Card>

      {stop.property?.accessNotes ? (
        <p className="rounded-card border border-waiting-line bg-waiting-bg px-4 py-3 text-[13.5px] text-ink">
          <span className="font-medium text-waiting">Getting in · </span>
          {stop.property.accessNotes}
        </p>
      ) : null}

      {stop.description ? (
        <Card className="flex flex-col gap-1.5">
          <Eyebrow>The job</Eyebrow>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">{stop.description}</p>
        </Card>
      ) : null}

      {stop.property?.equipment && stop.property.equipment.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>What is on site</Eyebrow>
          <ul className="flex flex-col gap-1.5">
            {stop.property.equipment.map((item, index) => (
              <li key={index} className="flex flex-col gap-0.5 text-[13.5px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span>{item.kind}</span>
                <span className="text-ink-muted sm:text-right">
                  {[item.make, item.model].filter(Boolean).join(" ")}
                  {item.installedYear ? ` · ${item.installedYear}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Photos</Eyebrow>
        <JobPhotos jobId={stop.id} />
      </Card>

      {/* Last, and biggest: what you actually do when you have finished reading. */}
      <StopActions job={stop} onChanged={() => setVersion((seen) => seen + 1)} />
    </div>
  );
}

/** Moving the job on. The server says which moves are allowed; this renders them. */
function StopActions({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState<JobStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (job.actions.statuses.length === 0) return null;

  async function move(to: JobStatus) {
    setBusy(to);
    setFailed(null);
    try {
      await changeJobStatus(job.id, job.status, to);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Could not update the job");
    } finally {
      setBusy(null);
      // Either way, show the job as it is now rather than as it was.
      onChanged();
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2" role="group" aria-label="Update status">
        {job.actions.statuses.map((to) => (
          <button
            key={to}
            type="button"
            disabled={busy !== null}
            onClick={() => void move(to)}
            className={`min-h-12 rounded-control px-4 text-[15px] font-medium disabled:opacity-50 ${
              to === "cancelled"
                ? "border border-blocked-line text-blocked"
                : "bg-accent text-accent-ink"
            }`}
          >
            {busy === to ? "Saving…" : STATUS_ACTION[to]}
          </button>
        ))}
      </div>
      {failed ? (
        <p role="alert" className="text-[13px] text-blocked">
          {failed}
        </p>
      ) : null}
    </div>
  );
}

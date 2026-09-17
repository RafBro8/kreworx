import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";

import {
  changeJobStatus,
  getJob,
  scheduleJob,
  unscheduleJob,
  type Crew,
  type JobDetail,
  type JobStatus,
} from "../lib/api";
import {
  clockWithPeriod,
  dateInZone,
  minutesOfDay,
  money,
  shortDate,
  STATUS,
  STATUS_ACTION,
  zonedIso,
} from "../lib/format";
import { useApi } from "../lib/useApi";
import { PhoneIcon } from "./icons";
import { Eyebrow, StatusPill } from "./ui";

type Props = {
  jobId: string;
  crews: Crew[];
  timezone: string;
  /** The day the board is showing — where an unscheduled job lands by default. */
  boardDate: string;
  onClose: () => void;
  /** Called after any successful change, so the board behind can refresh. */
  onChanged: () => void;
};

/**
 * Everything about one job, and what the signed-in person may do with it.
 *
 * The panel never decides what is allowed: the API sends the permitted next
 * statuses and whether the job can move, and the panel renders exactly those.
 * The rules live in one place, on the server.
 */
export default function JobPanel({ jobId, crews, timezone, boardDate, onClose, onChanged }: Props) {
  const [version, setVersion] = useState(0);
  const job = useApi(() => getJob(jobId), `${jobId}:${version}`);
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changed = () => {
    setVersion((value) => value + 1);
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button type="button" aria-label="Close job details" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/40" />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-border bg-panel shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.7)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-panel px-6 py-5">
          {job.status === "ready" ? (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[12px] text-ink-faint">#{job.data.number}</span>
                <StatusPill tone={STATUS[job.data.status].tone}>{STATUS[job.data.status].label}</StatusPill>
                {job.data.priority !== "normal" ? <StatusPill tone="blocked">{job.data.priority === "urgent" ? "Urgent" : "Priority"}</StatusPill> : null}
              </div>
              <h2 id={titleId} className="font-display text-[22px] leading-tight font-bold tracking-[-0.03em]">
                {job.data.title}
              </h2>
            </div>
          ) : (
            <h2 id={titleId} className="font-display text-[22px] font-bold tracking-[-0.03em]">
              Job details
            </h2>
          )}
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-control border border-border px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
          >
            Close
          </button>
        </header>

        {job.status === "loading" ? <p className="px-6 py-5 text-sm text-ink-muted">Loading…</p> : null}
        {job.status === "error" ? (
          <p className="px-6 py-5 text-sm text-blocked" role="alert">
            {job.message}
          </p>
        ) : null}
        {job.status === "ready" ? (
          <JobBody job={job.data} crews={crews} timezone={timezone} boardDate={boardDate} onChanged={changed} />
        ) : null}
      </section>
    </div>
  );
}

function JobBody({ job, crews, timezone, boardDate, onChanged }: { job: JobDetail; crews: Crew[]; timezone: string; boardDate: string; onChanged: () => void }) {
  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      {job.actions.statuses.length > 0 ? <StatusActions job={job} onChanged={onChanged} /> : null}

      <Section label="Where">
        {job.customer ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-medium">{job.customer.name}</span>
              {job.property ? (
                <span className="text-[13px] text-ink-muted">
                  {job.property.street}, {job.property.city} {job.property.state} {job.property.zip}
                </span>
              ) : null}
            </div>
            {job.customer.phone ? (
              <a
                href={`tel:${job.customer.phone.replace(/[^\d+]/g, "")}`}
                className="flex shrink-0 items-center gap-2 rounded-control border border-border px-3 py-2 text-[13px] text-ink-muted hover:text-ink"
              >
                <PhoneIcon size={15} />
                {job.customer.phone}
              </a>
            ) : null}
          </div>
        ) : null}
        {job.property?.accessNotes ? (
          <p className="rounded-tile border border-waiting-line bg-waiting-bg px-3 py-2.5 text-[13px] text-ink">
            <span className="font-medium text-waiting">Access · </span>
            {job.property.accessNotes}
          </p>
        ) : null}
        {job.description ? <p className="text-[13px] leading-relaxed text-ink-muted">{job.description}</p> : null}
      </Section>

      <Section label="When">
        {job.scheduledStart && job.scheduledEnd ? (
          <p className="text-[14px]">
            {shortDate(job.scheduledStart, timezone)} · {clockWithPeriod(job.scheduledStart, timezone)} – {clockWithPeriod(job.scheduledEnd, timezone)}
            {job.crew ? <span className="text-ink-muted"> · {job.crew.name}, {job.crew.van}</span> : null}
          </p>
        ) : (
          <p className="text-[14px] text-ink-muted">
            Not scheduled{job.schedulingNote ? ` · ${job.schedulingNote}` : ""}
          </p>
        )}
        {job.actions.reschedule ? <ScheduleForm job={job} crews={crews} timezone={timezone} boardDate={boardDate} onChanged={onChanged} /> : null}
      </Section>

      {job.property && job.property.equipment.length > 0 ? (
        <Section label="Equipment on site">
          <ul className="flex flex-col gap-1.5">
            {job.property.equipment.map((item, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span>{item.kind}</span>
                <span className="text-ink-muted">
                  {item.make} {item.model} · {item.installedYear}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {job.quote || job.invoice ? (
        <Section label="Money">
          {job.quote ? <MoneyRow label={`Quote Q-${job.quote.number}`} status={job.quote.status} cents={job.quote.totalCents} /> : null}
          {job.invoice ? <MoneyRow label={`Invoice INV-${job.invoice.number}`} status={job.invoice.status} cents={job.invoice.totalCents} /> : null}
        </Section>
      ) : null}

      {job.timeline.length > 0 ? (
        <Section label="History">
          <ol className="flex flex-col gap-2">
            {[...job.timeline].reverse().map((entry, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className={index === 0 ? "text-ink" : "text-ink-muted"}>{STATUS[entry.status].label}</span>
                <span className="font-mono text-[11.5px] text-ink-faint">
                  {shortDate(entry.at, timezone)} · {clockWithPeriod(entry.at, timezone)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {job.portalToken ? (
        <Link to={`/portal/${job.portalToken}`} className="text-[13px] text-accent hover:underline">
          Open what {job.customer?.name.split(" ")[0] ?? "the customer"} sees →
        </Link>
      ) : null}
    </div>
  );
}

/** The moves that push a job towards done get the solid button; side-steps and reversals do not. */
const FORWARD: readonly JobStatus[] = ["en_route", "on_site", "done"];

function StatusActions({ job, onChanged }: { job: JobDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(to: JobStatus) {
    setBusy(to);
    setError(null);
    try {
      await changeJobStatus(job.id, job.status, to);
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update the job");
      // Whatever happened, show the job as it is now rather than as it was.
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Update status">
        {job.actions.statuses.map((to) => (
          <button
            key={to}
            type="button"
            disabled={busy !== null}
            onClick={() => void move(to)}
            className={`rounded-control px-3.5 py-2 text-[13px] font-medium disabled:opacity-50 ${
              to === "cancelled"
                ? "border border-blocked-line text-blocked hover:bg-blocked-bg"
                : FORWARD.includes(to)
                  ? "bg-accent text-accent-ink hover:opacity-90"
                  : "border border-border text-ink-muted hover:text-ink"
            }`}
          >
            {busy === to ? "Saving…" : STATUS_ACTION[to]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-[13px] text-blocked" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const START_TIMES = Array.from({ length: (18 - 6) * 2 + 1 }, (_, index) => 6 * 60 + index * 30);
const DURATIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? "hour" : "hours"}`;
}

function ScheduleForm({ job, crews, timezone, boardDate, onChanged }: { job: JobDetail; crews: Crew[]; timezone: string; boardDate: string; onChanged: () => void }) {
  const ids = useId();
  const roundedDuration = DURATIONS.find((option) => option >= job.estimatedMinutes) ?? DURATIONS.at(-1)!;

  const [crewId, setCrewId] = useState(job.crew?.id ?? crews[0]?.id ?? "");
  const [date, setDate] = useState(job.scheduledStart ? dateInZone(job.scheduledStart, timezone) : boardDate);
  const [start, setStart] = useState(job.scheduledStart ? minutesOfDay(job.scheduledStart, timezone) : 8 * 60);
  const [duration, setDuration] = useState(roundedDuration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await scheduleJob(job.id, {
        crewId,
        start: zonedIso(date, start, timezone),
        end: zonedIso(date, start + duration, timezone),
      });
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not schedule the job");
    } finally {
      setSaving(false);
    }
  }

  async function unschedule() {
    setSaving(true);
    setError(null);
    try {
      await unscheduleJob(job.id);
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not unschedule the job");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-control border border-border bg-canvas px-3 py-2 text-[13px] text-ink";

  return (
    <form onSubmit={(event) => void save(event)} aria-label={job.scheduledStart ? "Reschedule" : "Schedule"} className="mt-1 flex flex-col gap-3 rounded-tile border border-border bg-surface p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${ids}-crew`} className="flex flex-col gap-1.5 text-[12px] text-ink-faint">
          Crew
          <select id={`${ids}-crew`} value={crewId} onChange={(event) => setCrewId(event.target.value)} className={field}>
            {crews.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name} · {crew.van}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${ids}-date`} className="flex flex-col gap-1.5 text-[12px] text-ink-faint">
          Date
          <input id={`${ids}-date`} type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={field} />
        </label>
        <label htmlFor={`${ids}-start`} className="flex flex-col gap-1.5 text-[12px] text-ink-faint">
          Start
          <select id={`${ids}-start`} value={start} onChange={(event) => setStart(Number(event.target.value))} className={field}>
            {START_TIMES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {timeLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${ids}-duration`} className="flex flex-col gap-1.5 text-[12px] text-ink-faint">
          Length
          <select id={`${ids}-duration`} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={field}>
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="text-[13px] text-blocked" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || !crewId} className="rounded-control bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink disabled:opacity-50">
          {saving ? "Saving…" : job.scheduledStart ? "Move job" : "Schedule job"}
        </button>
        {job.actions.unschedule ? (
          <button type="button" disabled={saving} onClick={() => void unschedule()} className="rounded-control border border-border px-3.5 py-2 text-[13px] text-ink-muted hover:text-ink disabled:opacity-50">
            Back to the queue
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </section>
  );
}

function MoneyRow({ label, status, cents }: { label: string; status: string; cents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span>
        {label} <span className="text-ink-faint">· {status}</span>
      </span>
      <span className="font-mono">{money(cents)}</span>
    </div>
  );
}

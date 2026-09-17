import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";

import { canOpen } from "../../auth/access";
import { useMe } from "../../auth/context";
import JobPanel from "../../components/JobPanel";
import { Eyebrow, StatusPill } from "../../components/ui";
import { getCrews, getJobs, getUnscheduledJobs, type Crew, type JobSummary } from "../../lib/api";
import {
  addDays,
  clock,
  dateInZone,
  initials,
  longDate,
  minutesOfDay,
  STATUS,
  timeRange,
  type Tone,
} from "../../lib/format";
import { useApi } from "../../lib/useApi";

// The board spans 7 AM to 5 PM: the working day plus the tail of a late job.
const BOARD_START = 7 * 60;
const BOARD_END = 17 * 60;
const HOURS = Array.from({ length: (BOARD_END - BOARD_START) / 60 }, (_, index) => 7 + index);

const blockTone: Record<Tone, string> = {
  done: "bg-done-bg border-done-line border-l-done",
  active: "bg-accent-soft/70 border-accent-line border-l-accent",
  waiting: "bg-waiting-bg border-waiting-line border-l-waiting",
  blocked: "bg-blocked-bg border-blocked-line border-l-blocked",
  quiet: "bg-surface border-border border-l-ink-faint",
};

const metaTone: Record<Tone, string> = {
  done: "text-done",
  active: "text-accent",
  waiting: "text-waiting",
  blocked: "text-blocked",
  quiet: "text-ink-faint",
};

/**
 * One day's schedule, one lane per van. Click a job to see everything about
 * it and act on it. The day lives in the URL, so a link to tomorrow's board
 * opens tomorrow's board.
 */
export default function Dispatch() {
  const me = useMe();
  const office = canOpen(me.user.role, "map");
  const [params, setParams] = useSearchParams();
  const requestedDate = params.get("date") ?? undefined;
  const [openJob, setOpenJob] = useState<string | null>(null);

  const crews = useApi(getCrews);
  const day = useApi(() => getJobs(requestedDate), requestedDate ?? "today");
  const queue = useApi(() => (office ? getUnscheduledJobs() : Promise.resolve([])), String(office));

  const { reload: reloadDay } = day;
  const { reload: reloadQueue } = queue;
  const refresh = useCallback(() => {
    reloadDay();
    reloadQueue();
  }, [reloadDay, reloadQueue]);
  const closePanel = useCallback(() => setOpenJob(null), []);

  if (crews.status === "loading" || day.status === "loading") return <p className="text-sm text-ink-muted">Loading the board…</p>;
  if (crews.status === "error") return <ErrorNote message={crews.message} />;
  if (day.status === "error") return <ErrorNote message={day.message} />;

  const { jobs, timezone, date } = day.data;
  const today = dateInZone(new Date(), timezone);
  const isToday = date === today;
  const done = jobs.filter((job) => job.status === "done").length;
  const goTo = (target: string) => setParams(target === today ? {} : { date: target });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
          <button type="button" aria-label="Previous day" onClick={() => goTo(addDays(date, -1))} className="rounded-[7px] px-2.5 py-1 text-[13px] text-ink-muted hover:bg-raised hover:text-ink">
            ‹
          </button>
          <button type="button" aria-label="Next day" onClick={() => goTo(addDays(date, 1))} className="rounded-[7px] px-2.5 py-1 text-[13px] text-ink-muted hover:bg-raised hover:text-ink">
            ›
          </button>
        </div>
        <h2 className="font-display text-lg font-bold tracking-[-0.02em]" aria-live="polite">
          {isToday ? "Today" : longDate(date)}
          {isToday ? <span className="ml-2 font-sans text-[13px] font-normal text-ink-faint">{longDate(date)}</span> : null}
        </h2>
        {!isToday ? (
          <button type="button" onClick={() => goTo(today)} className="rounded-control border border-border px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink">
            Back to today
          </button>
        ) : null}
        {day.refreshing ? <span className="text-[12px] text-ink-faint">Updating…</span> : null}
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <section aria-label="Schedule" className={`min-w-0 flex-1 overflow-x-auto transition-opacity ${day.refreshing ? "opacity-70" : ""}`}>
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[176px_1fr] border-b border-line pb-3">
              <Eyebrow>Crew</Eyebrow>
              <div className="relative h-4">
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className="absolute font-mono text-[11.5px] text-ink-faint"
                    style={{ left: `${((hour * 60 - BOARD_START) / (BOARD_END - BOARD_START)) * 100}%` }}
                  >
                    {hour === 12 ? "12 PM" : hour === 7 ? "7 AM" : hour > 12 ? hour - 12 : hour}
                  </span>
                ))}
              </div>
            </div>

            {crews.data.map((crew) => (
              <CrewLane
                key={crew.id}
                crew={crew}
                jobs={jobs.filter((job) => job.crewId === crew.id)}
                timezone={timezone}
                openJob={openJob}
                onOpen={setOpenJob}
              />
            ))}
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[300px]">
          <div className="rounded-card border border-border bg-surface p-4">
            <Eyebrow>{isToday ? "Today" : "This day"}</Eyebrow>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-[13px] text-ink-muted">Jobs complete</span>
              <span className="font-display text-2xl font-bold tracking-[-0.02em]">
                {done} <span className="text-ink-faint">/ {jobs.length}</span>
              </span>
            </div>
          </div>
          {office ? <UnscheduledQueue queue={queue} timezone={timezone} onOpen={setOpenJob} /> : null}
        </aside>
      </div>

      {openJob ? (
        <JobPanel jobId={openJob} crews={crews.data} timezone={timezone} boardDate={date} onClose={closePanel} onChanged={refresh} />
      ) : null}
    </div>
  );
}

function CrewLane({
  crew,
  jobs,
  timezone,
  openJob,
  onOpen,
}: {
  crew: Crew;
  jobs: JobSummary[];
  timezone: string;
  openJob: string | null;
  onOpen: (id: string) => void;
}) {
  const bookedMinutes = jobs.reduce((sum, job) => sum + job.estimatedMinutes, 0);

  return (
    <div className="grid h-[92px] grid-cols-[176px_1fr] items-center border-b border-line/60">
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-raised text-xs font-medium text-ink-muted">
          {crew.lead ? initials(crew.lead.name) : "—"}
        </span>
        <div className="flex flex-col gap-[3px]">
          <span className="text-sm font-medium">{crew.name}</span>
          <span className="font-mono text-[10.5px] text-ink-faint">
            {crew.van} · {Math.round(bookedMinutes / 60)}h booked
          </span>
        </div>
      </div>

      <ol aria-label={`${crew.name}'s jobs`} className="relative h-16">
        {jobs.length === 0 ? (
          <li className="absolute inset-0 flex items-center justify-center rounded-tile border border-dashed border-border text-xs text-ink-faint">
            Nothing booked
          </li>
        ) : null}
        {jobs.map((job) => (
          <JobBlock key={job.id} job={job} timezone={timezone} selected={openJob === job.id} onOpen={onOpen} />
        ))}
      </ol>
    </div>
  );
}

function JobBlock({ job, timezone, selected, onOpen }: { job: JobSummary; timezone: string; selected: boolean; onOpen: (id: string) => void }) {
  if (!job.scheduledStart || !job.scheduledEnd) return null;

  const span = BOARD_END - BOARD_START;
  const start = Math.max(minutesOfDay(job.scheduledStart, timezone), BOARD_START);
  const end = Math.min(minutesOfDay(job.scheduledEnd, timezone), BOARD_END);
  const { label, tone } = STATUS[job.status];
  // Scheduled work is quiet; only a job with something going on gets a status word.
  const showStatus = job.status !== "scheduled";

  return (
    <li
      className="absolute top-0 h-16"
      style={{ left: `calc(${((start - BOARD_START) / span) * 100}% + 2px)`, width: `calc(${((end - start) / span) * 100}% - 4px)` }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(job.id)}
        title={`#${job.number} ${job.title} — ${job.customer?.name ?? ""}, ${job.address?.street ?? ""}`}
        className={`flex h-full w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-tile border border-l-[3px] px-3 text-left transition-[filter] hover:brightness-125 ${blockTone[tone]} ${
          selected ? "ring-2 ring-accent" : ""
        }`}
      >
        <span className="w-full truncate text-[13px] font-medium">
          {job.title}
          {job.priority !== "normal" ? <span className="sr-only"> ({job.priority} priority)</span> : null}
        </span>
        <span className="w-full truncate text-xs text-ink-muted">
          {surnameOrBusiness(job)} · {job.address?.street}
        </span>
        <span className={`w-full truncate font-mono text-[10.5px] uppercase ${metaTone[tone]}`}>
          {timeRange(job.scheduledStart, job.scheduledEnd, timezone)}
          {showStatus ? ` · ${label}` : ""}
        </span>
      </button>
    </li>
  );
}

function UnscheduledQueue({
  queue,
  timezone,
  onOpen,
}: {
  queue: ReturnType<typeof useApi<JobSummary[]>>;
  timezone: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section aria-label="Unscheduled" className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Unscheduled</Eyebrow>
        {queue.status === "ready" ? <span className="font-mono text-[11px] text-ink-faint">{queue.data.length}</span> : null}
      </div>

      {queue.status === "loading" ? <p className="mt-3 text-[13px] text-ink-muted">Loading…</p> : null}
      {queue.status === "error" ? <p className="mt-3 text-[13px] text-blocked">{queue.message}</p> : null}
      {queue.status === "ready" && queue.data.length === 0 ? <p className="mt-3 text-[13px] text-ink-muted">Everything is on the board.</p> : null}
      {queue.status === "ready" && queue.data.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2.5">
          {queue.data.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => onOpen(job.id)}
                className="flex w-full flex-col gap-1 rounded-tile border border-border bg-canvas px-3 py-2.5 text-left hover:border-accent-line"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{job.title}</span>
                  {job.priority === "urgent" ? <StatusPill tone="blocked">Urgent</StatusPill> : null}
                </span>
                <span className="w-full truncate text-xs text-ink-muted">
                  {surnameOrBusiness(job)} · {job.address?.street}
                </span>
                <span className="font-mono text-[10.5px] text-ink-faint">
                  {job.schedulingNote ?? `Requested ${clock(job.requestedAt, timezone)}`} · {formatEstimate(job.estimatedMinutes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** "Whitaker" for a household, "Brightway Dental" for a business — how a dispatcher actually says it. */
function surnameOrBusiness(job: JobSummary): string {
  if (!job.customer) return "";
  return job.customer.kind === "commercial" ? job.customer.name : (job.customer.name.split(" ").pop() ?? job.customer.name);
}

function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m est`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h est`;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="text-sm text-blocked" role="alert">
      {message}
    </p>
  );
}

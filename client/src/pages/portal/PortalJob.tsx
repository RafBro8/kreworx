import { useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { Card, Display } from "../../components/ui";
import { PhoneIcon } from "../../components/icons";
import {
  answerQuote,
  ApiRequestError,
  getPortal,
  payInvoice,
  portalPhotoUrl,
  portalQuotePdfUrl,
  type JobStatus,
  type PortalView,
} from "../../lib/api";
import { clockWithPeriod, dateInZone, initials, minutesOfDay, money, shortDate } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useDemoMinutes } from "../../lib/useDemoClock";
import { useLive } from "../../lib/useLive";

// The four dots along the top, in the customer's words. The board says "en
// route" and "on site"; the person waiting at home says neither.
const STEPS = ["Booked", "On the way", "Started", "Finished"] as const;

/**
 * What each step is called on the customer's page.
 *
 * The board says "en route" and "on site" because that is what a dispatcher
 * says. Nobody waiting at home says either, so the same events are written
 * out here in the words the person reading them would use, with the
 * technician's name where there is one.
 */
function happened(status: JobStatus, firstName: string | null): string | null {
  switch (status) {
    case "scheduled":
      return "Visit booked";
    case "en_route":
      return firstName ? `${firstName} set off` : "Your technician set off";
    case "on_site":
      return firstName ? `${firstName} arrived` : "Your technician arrived";
    case "awaiting_approval":
      return "Quote sent for your approval";
    case "parts_on_order":
      return "Waiting on a part";
    case "done":
      return "Work completed";
    default:
      // "unscheduled" and "cancelled" are not moments in a visit.
      return null;
  }
}

/** Where on the four-step track each status sits. */
const STEP_OF: Record<JobStatus, number> = {
  unscheduled: 0,
  scheduled: 0,
  en_route: 1,
  on_site: 2,
  awaiting_approval: 2,
  parts_on_order: 2,
  done: 3,
  cancelled: 0,
};

/**
 * What the customer opens from a text message. No login and nothing to
 * install: the link is the whole experience.
 */
export default function PortalJob() {
  const { token = "" } = useParams();
  const portal = useApi(() => getPortal(token), token);

  // The link is the credential here too: it buys a socket for this one job, so
  // the page moves the moment the technician does, with nothing to refresh.
  const demoMinutes = useDemoMinutes(portal.status === "ready" ? portal.data.demo : null, 2000);
  const { reload } = portal;
  useLive({ onJobChanged: () => reload() }, { portalToken: token, enabled: Boolean(token) });

  if (portal.status === "loading") {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading your visit…</p>;
  }

  if (portal.status === "error") {
    return (
      <Card className="mt-6 rounded-2xl p-6">
        <div className="flex flex-col gap-2" role="alert">
          <Display className="text-2xl">
            {portal.httpStatus === 404 ? "This link has expired" : "We could not load your visit"}
          </Display>
          <p className="text-sm text-ink-muted">
            {portal.httpStatus === 404
              ? "Visit links stop working once a job is closed. If you were expecting an update, give us a call."
              : "Check your connection and try again."}
          </p>
        </div>
      </Card>
    );
  }

  const view = portal.data;

  return (
    <>
      <header className="-mx-5 -mt-5 mb-1 flex items-center justify-between border-b border-border bg-panel px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-accent font-display text-[13px] font-bold text-accent-ink">
            {view.company.name[0]}
          </span>
          <span className="text-[14.5px] font-medium">{view.company.name}</span>
        </div>
        <span className="font-mono text-[11px] text-ink-faint">#{view.job.number}</span>
      </header>

      <StatusCard view={view} demoMinutes={demoMinutes} />
      {view.technician ? <TechnicianCard technician={view.technician} phone={view.company.phone} /> : null}
      {view.photos.length > 0 ? <PhotosCard photos={view.photos} token={token} /> : null}
      <VisitRecord view={view} />
      {view.invoice ? <InvoiceCard invoice={view.invoice} token={token} timezone={view.company.timezone} /> : null}
      {view.quote ? (
        <QuoteCard
          quote={view.quote}
          timezone={view.company.timezone}
          firstName={view.technician?.name.split(" ")[0]}
          token={token}
          onAnswered={reload}
        />
      ) : null}
    </>
  );
}

function StatusCard({ view, demoMinutes }: { view: PortalView; demoMinutes: number | null }) {
  const { job, company } = view;
  const step = STEP_OF[job.status];
  const tz = company.timezone;

  const headline =
    job.status === "done"
      ? "All done"
      : job.status === "on_site"
        ? "Your technician is here"
        : job.status === "en_route" && job.scheduledStart
          ? `Arriving ${clockWithPeriod(job.scheduledStart, tz)}`
          : job.scheduledStart
            ? shortDate(job.scheduledStart, tz)
            : "Getting you booked in";

  // How far out the van is, in the customer words the design uses.
  const minutesOut =
    demoMinutes !== null && job.scheduledStart ? Math.round(minutesOfDay(job.scheduledStart, tz) - demoMinutes) : null;

  // A finished visit should say when, not repeat the job title back.
  const finishedAt = job.timeline.findLast((entry) => entry.status === "done")?.at ?? null;

  const detail =
    job.status === "done" && finishedAt
      ? `Finished at ${clockWithPeriod(finishedAt, tz)}`
      : job.status === "en_route"
        ? minutesOut !== null && minutesOut > 0
          ? `About ${minutesOut} ${minutesOut === 1 ? "minute" : "minutes"} out · on the way to ${view.address.street}`
          : minutesOut !== null
            ? `Arriving any minute now · ${view.address.street}`
            : `On the way to ${view.address.street}`
        : job.scheduledStart && job.scheduledEnd && job.status !== "done"
          ? `Arrival window ${clockWithPeriod(job.scheduledStart, tz)} - ${clockWithPeriod(job.scheduledEnd, tz)}`
          : job.title;

  const eyebrow =
    job.status === "en_route" ? "On the way" : job.status === "parts_on_order" ? "Waiting on parts" : STEPS[step];

  return (
    <Card className="rounded-2xl p-[18px] shadow-[0_1px_2px_rgba(23,28,34,0.05),0_8px_24px_-18px_rgba(23,28,34,0.25)]">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-[7px] w-[7px] rounded-full ${step >= 1 ? "bg-done" : "bg-ink-faint"}`} />
          <span className={`font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase ${step >= 1 ? "text-done" : "text-ink-faint"}`}>
            {eyebrow}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Display className="text-[30px] leading-[1.05]">{headline}</Display>
          <span className="text-[13.5px] text-ink-muted">{detail}</span>
        </div>

        <ol aria-label="Progress" className="flex items-center">
          {STEPS.map((label, index) => (
            <li key={label} className={`flex items-center ${index < STEPS.length - 1 ? "flex-1" : ""}`}>
              <span
                aria-label={`${label}${index <= step ? ", reached" : ""}`}
                className={`h-[9px] w-[9px] shrink-0 rounded-full ${index <= step ? "bg-accent" : "border-2 border-border bg-panel"}`}
              />
              {index < STEPS.length - 1 ? <span className={`h-0.5 flex-1 ${index < step ? "bg-accent" : "bg-border"}`} /> : null}
            </li>
          ))}
        </ol>
        <div className="flex justify-between font-mono text-[9.5px] uppercase" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span key={label} className={index <= step ? "text-ink-muted" : "text-ink-faint"}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TechnicianCard({ technician, phone }: { technician: NonNullable<PortalView["technician"]>; phone: string | null }) {
  return (
    <Card className="rounded-2xl p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] bg-raised text-[14.5px] font-medium text-ink-muted">
          {initials(technician.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14.5px] font-medium">{technician.name}</span>
          <span className="text-[12.5px] text-ink-muted">
            {[technician.title, technician.years ? `${technician.years} years` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            aria-label={`Call ${phone}`}
            className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-accent-soft text-accent"
          >
            <PhoneIcon size={18} />
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * What the technician photographed, in the order they took it.
 *
 * Only the pictures the crew marked to share ever reach this page - the server
 * filters them out of the response entirely - so there is nothing here to
 * decide. Each image is fetched on its own, so the page is readable before any
 * of them arrive.
 */
function PhotosCard({ photos, token }: { photos: PortalView["photos"]; token: string }) {
  return (
    <Card className="rounded-2xl p-[18px]">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.1em] text-ink-faint uppercase">
          {photos.length === 1 ? "Photo from the visit" : "Photos from the visit"}
        </span>
        <ul className="flex flex-col gap-3.5">
          {photos.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <img
                src={portalPhotoUrl(token, photo.id)}
                alt={photo.caption ?? "Photo taken during the visit"}
                loading="lazy"
                className="w-full rounded-tile border border-border bg-raised object-cover"
              />
              {photo.caption ? <span className="text-[12.5px] text-ink-muted">{photo.caption}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/**
 * What happened, and when.
 *
 * The four dots above say roughly where the visit has got to; this says it
 * exactly, which is what somebody wants when they are asking themselves
 * whether anyone actually turned up this morning. The server has been sending
 * this timeline since the job first moved - it is the same record the office
 * sees, written out differently.
 */
function VisitRecord({ view }: { view: PortalView }) {
  const tz = view.company.timezone;
  const firstName = view.technician?.name.split(" ")[0] ?? null;

  // The visit itself. Anything that happened on another day - a booking made
  // last week, a part ordered yesterday - is dated, because a column of clock
  // times with no dates reads as though the morning ran backwards.
  const visitDay = dateInZone(view.job.scheduledStart ?? view.job.timeline.at(-1)?.at ?? new Date(), tz);

  const entries = view.job.timeline
    .map((entry) => ({
      ...entry,
      label: happened(entry.status, firstName),
      onAnotherDay: dateInZone(entry.at, tz) !== visitDay,
    }))
    .filter((entry): entry is typeof entry & { label: string } => entry.label !== null);

  if (entries.length === 0) return null;

  return (
    <Card className="rounded-2xl p-[18px]">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.1em] text-ink-faint uppercase">
          What happened
        </span>
        <ol className="flex flex-col gap-2.5">
          {entries.map((entry, index) => (
            <li key={index} className="flex items-baseline justify-between gap-4">
              <span className={`text-[13.5px] ${index === entries.length - 1 ? "text-ink" : "text-ink-muted"}`}>
                {entry.label}
              </span>
              <span className="font-mono text-[11.5px] whitespace-nowrap text-ink-faint">
                {entry.onAnotherDay ? `${shortDate(entry.at, tz)} · ` : ""}
                {clockWithPeriod(entry.at, tz)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

/**
 * What is owed, and the way to settle it.
 *
 * The button only asks the server to start a payment; it never knows the
 * amount, because an amount that travels through a browser is one somebody can
 * change. Coming back from Stripe does not mark anything paid either - that is
 * the webhook's job - so this page waits to be told rather than assuming.
 */
function InvoiceCard({
  invoice,
  token,
  timezone,
}: {
  invoice: NonNullable<PortalView["invoice"]>;
  token: string;
  timezone: string;
}) {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const settled = invoice.status === "paid";

  // Stripe sends them back here after the payment page.
  const justPaid = params.get("paid") === "1" && !settled;

  async function pay() {
    setBusy(true);
    setFailed(null);
    try {
      const { url } = await payInvoice(token);
      window.location.assign(url);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "That did not go through");
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl p-[18px]">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase ${settled ? "text-done" : "text-waiting"}`}>
            {settled ? "Paid" : "Amount due"}
          </span>
          <span className="font-mono text-[10.5px] text-ink-faint">INV-{invoice.number}</span>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <span className="font-display text-[26px] font-bold tracking-[-0.03em]">{money(invoice.totalCents)}</span>
          {settled && invoice.paidAt ? (
            <span className="text-[12.5px] text-ink-muted">Received {shortDate(invoice.paidAt, timezone)}</span>
          ) : invoice.dueAt ? (
            <span className="text-[12.5px] text-ink-muted">Due {shortDate(invoice.dueAt, timezone)}</span>
          ) : null}
        </div>

        {justPaid ? (
          <p role="status" className="rounded-tile bg-raised px-3 py-2.5 text-center text-[12px] text-ink-muted">
            Thank you. Card payments take a moment to confirm - this page updates itself when it lands.
          </p>
        ) : null}

        {failed ? (
          <p role="alert" className="rounded-tile bg-blocked-bg px-3 py-2.5 text-center text-[12px] text-blocked">
            {failed}
          </p>
        ) : null}

        {invoice.payable ? (
          <button
            type="button"
            onClick={pay}
            disabled={busy}
            aria-busy={busy}
            className="min-h-12 rounded-tile bg-accent px-4 text-[15px] font-medium text-accent-ink disabled:opacity-60"
          >
            {busy ? "Taking you to the card page…" : `Pay ${money(invoice.totalCents)} by card`}
          </button>
        ) : !settled ? (
          <p className="rounded-tile bg-raised px-3 py-2.5 text-center text-[12px] text-ink-muted">
            Give us a call to settle this one.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function QuoteCard({
  quote,
  timezone,
  firstName,
  token,
  onAnswered,
}: {
  quote: NonNullable<PortalView["quote"]>;
  timezone: string;
  firstName?: string;
  token: string;
  onAnswered: () => void;
}) {
  const waiting = quote.status === "sent";
  const [sending, setSending] = useState<"approved" | "declined" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function answer(decision: "approved" | "declined") {
    setSending(decision);
    setFailed(null);
    try {
      await answerQuote(token, decision);
    } catch (error) {
      // A 409 means the answer is already recorded - hers, or the office
      // taking it by phone. Reloading shows her what actually stands, which
      // is more use than an error she cannot act on.
      const conflict = error instanceof ApiRequestError && error.status === 409;
      if (!conflict) setFailed(error instanceof Error ? error.message : "That did not go through");
    } finally {
      setSending(null);
      // Either way, the truth is on the server.
      onAnswered();
    }
  }

  return (
    <Card className="rounded-2xl p-[18px]">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase ${waiting ? "text-waiting" : "text-done"}`}>
            {waiting ? "Needs your approval" : quote.status === "approved" ? "Approved" : "Declined"}
          </span>
          {quote.respondedAt && !waiting ? (
            <span className="font-mono text-[10.5px] text-ink-faint">{clockWithPeriod(quote.respondedAt, timezone)}</span>
          ) : quote.sentAt ? (
            <span className="font-mono text-[10.5px] text-ink-faint">Sent {clockWithPeriod(quote.sentAt, timezone)}</span>
          ) : null}
        </div>

        {quote.findings ? <p className="text-[13px] leading-relaxed text-ink-muted">{quote.findings}</p> : null}

        <ul className="flex flex-col gap-2">
          {quote.lineItems.map((item, index) => (
            <li key={index} className="flex items-baseline justify-between gap-4">
              <span className={`text-[13px] ${item.waived ? "text-done" : "text-ink-muted"}`}>
                {item.waived ? `${item.description} waived` : item.description}
              </span>
              <span className={`font-mono text-[13px] ${item.waived ? "text-done" : ""}`}>
                {item.waived ? `-${money(item.unitPriceCents * item.quantity)}` : money(item.amountCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="h-px bg-line" />
        <div className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-medium">Total</span>
          <span className="font-display text-[26px] font-bold tracking-[-0.03em]">{money(quote.totalCents)}</span>
        </div>

        <a
          href={portalQuotePdfUrl(token)}
          className="text-center text-[12.5px] text-accent underline underline-offset-2"
        >
          Download a copy (PDF)
        </a>

        {waiting ? (
          <div className="flex flex-col gap-2.5">
            {failed ? (
              <p role="alert" className="rounded-tile bg-blocked-bg px-3 py-2.5 text-center text-[12px] text-blocked">
                {failed}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => answer("approved")}
              disabled={sending !== null}
              aria-busy={sending === "approved"}
              className="min-h-12 rounded-tile bg-accent px-4 text-[15px] font-medium text-accent-ink disabled:opacity-60"
            >
              {sending === "approved" ? "Sending…" : `Approve ${money(quote.totalCents)}`}
            </button>
            <button
              type="button"
              onClick={() => answer("declined")}
              disabled={sending !== null}
              aria-busy={sending === "declined"}
              className="min-h-11 rounded-tile px-4 text-[13.5px] text-ink-muted disabled:opacity-60"
            >
              {sending === "declined" ? "Sending…" : "Not right now"}
            </button>
            <p className="text-center text-[11.5px] text-ink-faint">
              {firstName ? `${firstName} is notified the moment you tap.` : "Your technician is notified the moment you tap."}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

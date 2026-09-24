import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useMe } from "../../auth/context";
import LineItems from "../../components/LineItems";
import { Card, Eyebrow, StatusPill } from "../../components/ui";
import {
  getInvoice,
  getQuote,
  markInvoicePaid,
  saveInvoice,
  saveQuote,
  sendQuote,
  type LineItemInput,
  type MoneyDetail,
} from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import { emptyLine, totalOf } from "../../lib/lineItems";
import { useApi } from "../../lib/useApi";

type Kind = "quote" | "invoice";

const TONE: Record<string, "quiet" | "waiting" | "done" | "blocked" | "active"> = {
  draft: "quiet",
  sent: "waiting",
  approved: "done",
  declined: "blocked",
  paid: "done",
  overdue: "blocked",
  void: "quiet",
};

/**
 * One quote or one invoice, open for writing.
 *
 * The two documents are the same shape - a customer, some lines and a total -
 * so they share a page rather than being written twice and drifting apart.
 * What differs is only what you may do at the end: send a quote, or mark an
 * invoice settled.
 */
export default function MoneyDocument({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const document = useApi(() => (kind === "quote" ? getQuote(id) : getInvoice(id)), `${kind}:${id}`);

  if (document.status === "loading") {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>;
  }

  if (document.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-blocked">
          {document.httpStatus === 404 ? "There is no such document." : document.message}
        </p>
        <Link to="/money" className="text-[13px] text-accent">
          Back to the money
        </Link>
      </div>
    );
  }

  // Keyed on what the server last said, so a reload after saving starts the
  // editor again from the stored document rather than an effect copying it
  // into state behind the scenes.
  const stored = document.data;
  const version = `${stored.id}:${stored.status}:${stored.totalCents}:${stored.lineItems.length}`;

  return <Editor key={version} kind={kind} stored={stored} reload={document.reload} />;
}

function Editor({ kind, stored, reload }: { kind: Kind; stored: MoneyDetail; reload: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const tz = me.company.timezone;

  const [lines, setLines] = useState<LineItemInput[]>(() => {
    const stored_ = stored.lineItems.map(({ kind: lineKind, description, detail, quantity, unitPriceCents, waived }) => ({
      kind: lineKind,
      description,
      detail: detail ?? undefined,
      quantity,
      unitPriceCents,
      waived,
    }));
    // A new quote arrives with nothing on it; give it a line to type into.
    return stored_.length > 0 ? stored_ : [emptyLine()];
  });
  const [findings, setFindings] = useState(stored.findings ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const label = kind === "quote" ? `Quote Q-${stored.number}` : `Invoice INV-${stored.number}`;

  async function act(what: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setFailed(null);
    setSaved(false);
    try {
      await what();
      after?.();
      reload();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "That did not go through");
    } finally {
      setBusy(false);
    }
  }

  const body = () => ({ findings: findings.trim() || undefined, lineItems: lines });

  return (
    <div className="flex flex-col gap-4">
      <Link to="/money" className="w-fit text-[12.5px] text-ink-muted hover:text-ink">
        ← Money
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">{label}</h1>
          <span className="text-[13px] text-ink-muted">
            {stored.customer}
            {stored.job ? ` · #${stored.job.number} ${stored.job.title}` : ""}
          </span>
        </div>
        <StatusPill tone={TONE[stored.status] ?? "quiet"}>{stored.status}</StatusPill>
      </div>

      {kind === "quote" ? (
        <Card className="flex flex-col gap-2">
          <Eyebrow>What we found</Eyebrow>
          <textarea
            value={findings}
            disabled={!stored.editable || busy}
            onChange={(event) => setFindings(event.target.value)}
            rows={3}
            maxLength={2000}
            aria-label="What we found"
            placeholder="The diagnosis, in plain English - this is the first thing the customer reads."
            className="rounded-control border border-border bg-surface px-3 py-2 text-[13.5px] placeholder:text-ink-faint"
          />
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <Eyebrow>Lines</Eyebrow>
        <LineItems items={lines} onChange={setLines} disabled={!stored.editable || busy} />
      </Card>

      {failed ? (
        <p role="alert" className="text-[13px] text-blocked">
          {failed}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {stored.editable ? (
          <>
            <button
              type="button"
              onClick={() =>
                act(
                  () => (kind === "quote" ? saveQuote(stored.id, body()) : saveInvoice(stored.id, { lineItems: lines })),
                  () => setSaved(true),
                )
              }
              disabled={busy || lines.some((line) => !line.description.trim())}
              className="h-10 rounded-control border border-border bg-raised px-4 text-[13.5px] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>

            {kind === "quote" ? (
              <button
                type="button"
                onClick={() =>
                  act(async () => {
                    // Saved first, so what goes to the customer is what is on
                    // the screen rather than the last thing that was saved.
                    await saveQuote(stored.id, body());
                    await sendQuote(stored.id);
                  })
                }
                disabled={busy || totalOf(lines) === 0 || lines.some((line) => !line.description.trim())}
                className="h-10 rounded-control bg-accent px-4 text-[13.5px] font-medium text-accent-ink disabled:opacity-60"
              >
                Send to the customer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => act(() => markInvoicePaid(stored.id), () => navigate("/money"))}
                disabled={busy}
                className="h-10 rounded-control bg-accent px-4 text-[13.5px] font-medium text-accent-ink disabled:opacity-60"
              >
                Mark as paid
              </button>
            )}

            {saved ? <span className="text-[12.5px] text-done">Saved</span> : null}
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">
            {kind === "quote"
              ? `Sent${stored.sentAt ? ` ${shortDate(stored.sentAt, tz)}` : ""} and no longer editable - write a new quote instead.`
              : `Settled${stored.paidAt ? ` ${shortDate(stored.paidAt, tz)}` : ""}. A paid invoice cannot be changed.`}
          </p>
        )}

        <span className="ml-auto font-mono text-[12.5px] text-ink-faint">
          {kind === "quote"
            ? stored.validUntil
              ? `Valid until ${shortDate(stored.validUntil, tz)}`
              : ""
            : stored.dueAt
              ? `Due ${shortDate(stored.dueAt, tz)} · ${money(stored.totalCents)}`
              : ""}
        </span>
      </div>
    </div>
  );
}

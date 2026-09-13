import type { ReactNode } from "react";

/** A small uppercase mono label — the spine sheet's section marker. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink-faint uppercase">
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-4 [[data-theme=customer]_&]:shadow-[0_1px_2px_rgba(23,28,34,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Display({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-display text-3xl font-bold tracking-[-0.035em] ${className}`}>
      {children}
    </span>
  );
}

/**
 * Colour in Kreworx only ever means job state, so the pill is the one place
 * that maps a state to a colour. Everything else stays ink and paper.
 */
const tones = {
  done: "bg-done-bg text-done border-done-line",
  active: "bg-accent-soft text-accent border-accent-line",
  waiting: "bg-waiting-bg text-waiting border-waiting-line",
  blocked: "bg-blocked-bg text-blocked border-blocked-line",
  quiet: "bg-raised text-ink-muted border-border",
} as const;

export type Tone = keyof typeof tones;

export function StatusPill({ tone = "quiet", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-3 py-[5px] text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <Display className="text-2xl">{value}</Display>
      {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </div>
  );
}

/**
 * Stage 1 ships the shell, so most routes are still empty. Rather than a blank
 * page or fake content that might get mistaken for the real thing, each route
 * says plainly what will live there and when.
 */
export function ComingUp({
  title,
  stage,
  children,
}: {
  title: string;
  stage: string;
  children: ReactNode;
}) {
  return (
    <Card className="max-w-2xl border-dashed">
      <div className="flex flex-col gap-3">
        <Eyebrow>{stage}</Eyebrow>
        <span className="font-display text-xl font-bold tracking-[-0.03em]">{title}</span>
        <p className="text-sm leading-relaxed text-ink-muted">{children}</p>
      </div>
    </Card>
  );
}

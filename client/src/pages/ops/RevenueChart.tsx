import { useId, useState } from "react";

import { money, moneyRounded } from "../../lib/format";

export type RevenueWeek = { weekStart: string; billedCents: number; settledCents: number };

/**
 * Twelve weeks of money, billed against settled.
 *
 * Two bars a week rather than two lines, because these are totals for a period
 * and not readings at an instant. They share one axis - both are dollars - and
 * the gap between them is the thing worth seeing: how long the business waits
 * to be paid for what it has already done.
 */
export default function RevenueChart({ weeks }: { weeks: RevenueWeek[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const labelled = useId();

  const peak = Math.max(...weeks.map((week) => Math.max(week.billedCents, week.settledCents)), 1);
  // Round the top of the axis up to a whole $5k so the gridlines are readable
  // numbers rather than whatever the busiest week happened to be.
  const step = 5_000_00;
  const top = Math.ceil(peak / step) * step;
  const lines = Array.from({ length: top / step + 1 }, (_, index) => index * step);

  // One fixed drawing space, scaled by the browser. Below about 560px the
  // labels stop being readable, so the chart scrolls sideways instead of
  // shrinking into illegibility.
  const width = 720;
  const height = 240;
  const pad = { top: 16, right: 12, bottom: 28, left: 52 };
  const plot = { width: width - pad.left - pad.right, height: height - pad.top - pad.bottom };

  const band = plot.width / weeks.length;
  const bar = Math.min(14, (band - 8) / 2);
  const y = (cents: number) => pad.top + plot.height - (cents / top) * plot.height;

  const latest = weeks.length - 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-4" aria-hidden>
          <Key className="bg-billed" label="Billed" />
          <Key className="bg-settled" label="Settled" />
        </div>
        <button
          type="button"
          onClick={() => setAsTable((shown) => !shown)}
          aria-expanded={asTable}
          aria-controls={labelled}
          className="rounded-control border border-border px-2.5 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          {asTable ? "Hide the numbers" : "Show the numbers"}
        </button>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[240px] w-full min-w-[560px]"
          role="img"
          aria-label={`Money billed and settled over the last ${weeks.length} weeks. The numbers are below the chart.`}
        >
          {/* Hairline grid, one shade off the surface, solid rather than dashed. */}
          {lines.map((value) => (
            <g key={value}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--surface-line)"
                strokeWidth={1}
              />
              <text x={pad.left - 8} y={y(value) + 4} textAnchor="end" className="fill-ink-faint font-mono text-[10px]">
                {value === 0 ? "0" : `${value / 100_000}k`}
              </text>
            </g>
          ))}

          {weeks.map((week, index) => {
            const left = pad.left + index * band;
            const pair = left + band / 2 - bar - 1;
            const active = hovered === index;
            return (
              <g key={week.weekStart}>
                {/* The hit target is the whole column, not the bars, so a week
                    with almost no trade is still easy to point at. */}
                <rect
                  x={left}
                  y={pad.top}
                  width={band}
                  height={plot.height}
                  fill={active ? "var(--surface-raised)" : "transparent"}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                />
                <rect
                  x={pair}
                  y={y(week.billedCents)}
                  width={bar}
                  height={Math.max(plot.height - (y(week.billedCents) - pad.top), 0)}
                  rx={3}
                  className="fill-billed"
                  pointerEvents="none"
                />
                {/* Two pixels of surface between the pair, not a border. */}
                <rect
                  x={pair + bar + 2}
                  y={y(week.settledCents)}
                  width={bar}
                  height={Math.max(plot.height - (y(week.settledCents) - pad.top), 0)}
                  rx={3}
                  className="fill-settled"
                  pointerEvents="none"
                />
                {index % 2 === 0 || active ? (
                  <text
                    x={left + band / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className={`font-mono text-[10px] ${active ? "fill-ink" : "fill-ink-faint"}`}
                  >
                    {shortWeek(week.weekStart)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* One direct label: the week we are in. The axis and the hover carry
              the rest, because a number on every bar is unreadable. */}
          {hovered === null && weeks[latest] ? (
            <text
              x={pad.left + latest * band + band / 2}
              y={y(weeks[latest].billedCents) - 6}
              textAnchor="middle"
              className="fill-ink-muted font-mono text-[10px]"
            >
              {moneyRounded(weeks[latest].billedCents)}
            </text>
          ) : null}
        </svg>
      </div>

      <p className="min-h-[18px] text-[12.5px] text-ink-muted" role="status">
        {hovered !== null && weeks[hovered] ? (
          <>
            <span className="font-mono">Week of {shortWeek(weeks[hovered].weekStart)}</span> · billed{" "}
            {money(weeks[hovered].billedCents)} · settled {money(weeks[hovered].settledCents)}
          </>
        ) : (
          "Billed is when the work was invoiced; settled is when the money arrived."
        )}
      </p>

      {asTable ? (
        <div id={labelled} className="min-w-0 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="py-1.5 font-normal">Week of</th>
                <th className="py-1.5 text-right font-normal">Billed</th>
                <th className="py-1.5 text-right font-normal">Settled</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {weeks.map((week) => (
                <tr key={week.weekStart} className="border-t border-line">
                  <td className="py-1.5">{shortWeek(week.weekStart)}</td>
                  <td className="py-1.5 text-right">{money(week.billedCents)}</td>
                  <td className="py-1.5 text-right">{money(week.settledCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
      <span className={`h-2.5 w-2.5 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Jul" from a plain YYYY-MM-DD, with no timezone to get wrong. */
function shortWeek(date: string): string {
  const [, month, day] = date.split("-").map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]}`;
}

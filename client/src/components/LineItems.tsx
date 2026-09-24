import { LINE_KINDS, type LineItemInput, type LineKind } from "../lib/api";
import { money } from "../lib/format";
import { dollarsFrom, centsFrom, emptyLine, totalOf } from "../lib/lineItems";

/**
 * The lines on a quote or an invoice: the editor for them. The arithmetic and
 * the dollar/cent conversion live in lib/lineItems, so they can be tested and
 * reused without rendering anything.
 */

const KIND_LABEL: Record<LineKind, string> = { part: "Part", labour: "Labour", fee: "Fee" };

export default function LineItems({
  items,
  onChange,
  disabled = false,
}: {
  items: LineItemInput[];
  onChange: (items: LineItemInput[]) => void;
  disabled?: boolean;
}) {
  const replace = (index: number, changes: Partial<LineItemInput>) =>
    onChange(items.map((item, at) => (at === index ? { ...item, ...changes } : item)));

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-2" aria-label="Lines">
        {items.map((item, index) => (
          <li key={index} className="grid grid-cols-[7rem_1fr] gap-2 sm:grid-cols-[7rem_1fr_4.5rem_7rem_auto]">
            <select
              value={item.kind}
              disabled={disabled}
              aria-label={`Line ${index + 1} kind`}
              onChange={(event) => replace(index, { kind: event.target.value as LineKind })}
              className="h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2 text-[13px]"
            >
              {LINE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>

            <input
              value={item.description}
              disabled={disabled}
              maxLength={120}
              placeholder="Description"
              aria-label={`Line ${index + 1} description`}
              onChange={(event) => replace(index, { description: event.target.value })}
              className="h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2.5 text-[13px] placeholder:text-ink-faint"
            />

            <input
              value={String(item.quantity)}
              disabled={disabled}
              inputMode="decimal"
              aria-label={`Line ${index + 1} quantity`}
              onChange={(event) => {
                const quantity = Number(event.target.value);
                if (event.target.value === "" || Number.isFinite(quantity)) {
                  replace(index, { quantity: event.target.value === "" ? 0 : quantity });
                }
              }}
              className="h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2 text-right font-mono text-[13px]"
            />

            <input
              defaultValue={dollarsFrom(item.unitPriceCents)}
              disabled={disabled}
              inputMode="decimal"
              aria-label={`Line ${index + 1} price`}
              onChange={(event) => {
                const cents = centsFrom(event.target.value);
                if (cents !== null) replace(index, { unitPriceCents: cents });
              }}
              className="h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2 text-right font-mono text-[13px]"
            />

            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-start">
              <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={Boolean(item.waived)}
                  disabled={disabled}
                  onChange={(event) => replace(index, { waived: event.target.checked })}
                />
                Waived
              </label>
              {!disabled && items.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => onChange(items.filter((_, at) => at !== index))}
                  className="px-1 text-[15px] leading-none text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-4">
        {!disabled ? (
          <button
            type="button"
            onClick={() => onChange([...items, emptyLine()])}
            className="h-9 rounded-control border border-border bg-raised px-3 text-[13px]"
          >
            Add line
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-ink-muted">Total</span>
          <span className="font-display text-[22px] leading-none font-bold" data-testid="total">
            {money(totalOf(items))}
          </span>
        </div>
      </div>
    </div>
  );
}

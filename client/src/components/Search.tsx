import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { search, type SearchResults } from "../lib/api";
import { STATUS } from "../lib/format";
import { SearchIcon } from "./icons";
import { StatusPill } from "./ui";

/** Long enough that the answer is worth reading, short enough to feel instant. */
const SETTLE_MS = 180;
/** The server ignores anything shorter, so there is no point asking. */
const SHORTEST = 2;

type Hit = { key: string; to: string; label: string; detail: string | null; badge?: React.ReactNode };

/**
 * One box over the jobs and the people.
 *
 * The office knows a job by its number, a customer by their name and a house
 * by its street, and which of those is in someone's head changes by the hour.
 * So there is one box, the answer says which kind each hit is, and the whole
 * thing is reachable from the keyboard: the people who live in this screen all
 * day are the ones who will never touch the mouse for it.
 */
export default function Search() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  const term = query.trim();
  const worthAsking = term.length >= SHORTEST;

  useEffect(() => {
    if (!worthAsking) return;
    // One request per pause in typing, and an answer that arrives after a
    // newer one has been asked for is thrown away rather than shown.
    let current = true;
    const timer = setTimeout(() => {
      search(term)
        .then((found) => {
          if (!current) return;
          setResults(found);
          setActive(0);
        })
        .catch(() => {
          if (current) setResults(null);
        })
        .finally(() => {
          if (current) setBusy(false);
        });
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, worthAsking]);

  // Clicking anywhere else puts the box away, the same as pressing escape.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const found = worthAsking ? results : null;

  const hits: Hit[] = found
    ? [
        ...found.jobs.map((job) => ({
          key: `job-${job.id}`,
          // The board shows one day at a time, so the link carries the day.
          to: `/dispatch?${job.date ? `date=${job.date}&` : ""}job=${job.id}`,
          label: `#${job.number} ${job.title}`,
          detail: [job.customer, job.where].filter(Boolean).join(" · ") || null,
          badge: <StatusPill tone={STATUS[job.status].tone}>{STATUS[job.status].label}</StatusPill>,
        })),
        ...found.customers.map((customer) => ({
          key: `customer-${customer.id}`,
          to: `/customers/${customer.id}`,
          label: customer.name,
          detail: customer.detail,
        })),
      ]
    : [];

  const firstCustomer = found?.jobs.length ?? 0;

  function choose(hit: Hit) {
    setOpen(false);
    setQuery("");
    setResults(null);
    navigate(hit.to);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((at) => (event.key === "ArrowDown" ? (at + 1) % hits.length : (at - 1 + hits.length) % hits.length));
      return;
    }
    if (event.key === "Enter" && open && hits[active]) {
      event.preventDefault();
      choose(hits[active]);
    }
  }

  const showing = open && worthAsking;

  return (
    <div ref={box} className="relative hidden max-w-[340px] flex-1 md:block">
      <div className="flex items-center gap-2.5 rounded-control border border-border bg-canvas px-3 focus-within:border-accent-line">
        <SearchIcon size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (event.target.value.trim().length >= SHORTEST) setBusy(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search jobs, customers, addresses"
          aria-label="Search jobs, customers, addresses"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-[42px] min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {showing ? (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-card border border-border bg-panel shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-ink-muted">
              {busy ? "Looking…" : `Nothing matching "${term}".`}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[320px] overflow-y-auto">
              {hits.map((hit, index) => (
                <li key={hit.key}>
                  {index === 0 && found!.jobs.length > 0 ? <Group>Jobs</Group> : null}
                  {index === firstCustomer && found!.customers.length > 0 ? <Group>Customers</Group> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(hit)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                      index === active ? "bg-raised" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px]">{hit.label}</span>
                      {hit.detail ? <span className="truncate text-[11.5px] text-ink-faint">{hit.detail}</span> : null}
                    </span>
                    {hit.badge}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <span className="block border-b border-line bg-canvas px-3.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-ink-faint uppercase">
      {children}
    </span>
  );
}

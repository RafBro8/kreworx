import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { homeFor } from "../auth/access";
import { useAuth } from "../auth/context";
import { getDemoAccounts, type DemoAccounts, type Role } from "../lib/api";
import { initials } from "../lib/format";
import { useApi } from "../lib/useApi";

const SEATS: { role: Role; name: string; blurb: string }[] = [
  { role: "owner", name: "Renee Castillo", blurb: "The morning numbers: what got done, what is owed, what is waiting." },
  { role: "dispatcher", name: "Dana Morales", blurb: "The board: four vans, eleven jobs, one urgent leak to fit in." },
  { role: "technician", name: "Tomas Delgado", blurb: "His own day, and nobody else's, on the way to his next call." },
];

/**
 * The first thing someone evaluating Kreworx sees. No sign-up and no
 * password: pick a seat at Northline Mechanical and you are in it.
 */
export default function Welcome() {
  const auth = useAuth();
  const accounts = useApi(getDemoAccounts);
  const navigate = useNavigate();
  const [entering, setEntering] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const slowWake = useSlowAfter(accounts.status === "loading", 3000);

  if (auth.status === "signedIn") return <Navigate to={homeFor(auth.me.user.role)} replace />;

  async function enter(person: DemoAccounts["staff"][number]) {
    setEntering(person.id);
    setFailure(null);
    try {
      await auth.signInAs(person.id);
      navigate(homeFor(person.role), { replace: true });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not sign in");
      setEntering(null);
    }
  }

  return (
    <div data-theme="ops" className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12 md:py-20">
        <header className="flex items-center gap-3">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-accent-line bg-accent-soft font-display text-[15px] font-bold text-accent">
            K
          </span>
          <span className="font-display text-lg font-bold tracking-[-0.03em]">Kreworx</span>
        </header>

        <section className="flex max-w-2xl flex-col gap-4">
          <span className="font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">Live demo</span>
          <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-[-0.035em] md:text-5xl">
            See the same morning from every seat.
          </h1>
          <p className="text-[15px] leading-relaxed text-ink-muted">
            Northline Mechanical is a heating and cooling contractor in Mokena, Illinois, with four vans on the road.
            It is twenty past ten. Pick who you want to be — no sign-up, and you can switch seats at any time.
          </p>
        </section>

        {accounts.status === "loading" ? (
          <p className="text-sm text-ink-muted" role="status">
            {slowWake
              ? "Waking the demo server. On the first visit of the day this can take up to a minute."
              : "Loading the demo…"}
          </p>
        ) : accounts.status === "error" ? (
          <div className="flex flex-col items-start gap-3" role="alert">
            <p className="text-sm text-blocked">{accounts.message}</p>
            <button type="button" onClick={accounts.reload} className="rounded-control border border-border px-4 py-2 text-sm text-ink-muted hover:text-ink">
              Try again
            </button>
          </div>
        ) : (
          <section aria-label="Choose a seat" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEATS.map((seat) => {
              const person = accounts.data.staff.find((candidate) => candidate.name === seat.name);
              if (!person) return null;
              return (
                <button
                  key={seat.role}
                  type="button"
                  onClick={() => void enter(person)}
                  disabled={entering !== null}
                  className="group flex flex-col gap-4 rounded-card border border-border bg-surface p-5 text-left transition-colors hover:border-accent-line disabled:opacity-60"
                >
                  <SeatHeader eyebrow={person.title ?? seat.role} name={person.name} />
                  <p className="text-[13px] leading-relaxed text-ink-muted">{seat.blurb}</p>
                  <span className="mt-auto text-[13px] font-medium text-accent">
                    {entering === person.id ? "Opening…" : `Continue as ${person.name.split(" ")[0]} →`}
                  </span>
                </button>
              );
            })}

            {accounts.data.customer ? (
              // The customer seat is drawn in the customer theme, so the four
              // cards preview the two faces of the product side by side.
              <Link
                data-theme="customer"
                to={`/portal/${accounts.data.customer.portalToken}`}
                className="flex flex-col gap-4 rounded-card border border-border bg-surface! p-5 text-left transition-colors hover:border-accent"
              >
                <SeatHeader eyebrow="Customer" name={accounts.data.customer.name} />
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  Her furnace is out. She has a text with a link — this is what opens.
                </p>
                <span className="mt-auto text-[13px] font-medium text-accent">Open her link →</span>
              </Link>
            ) : null}
          </section>
        )}

        {failure ? (
          <p className="text-sm text-blocked" role="alert">
            {failure}
          </p>
        ) : null}

        <footer className="mt-auto text-xs text-ink-faint">
          Northline Mechanical, its staff and customers are fictional. The data resets every day.
        </footer>
      </div>
    </div>
  );
}

function SeatHeader({ eyebrow, name }: { eyebrow: string; name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-raised text-[13px] font-medium text-ink-muted">
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint uppercase">{eyebrow}</span>
        <span className="truncate text-[15px] font-medium">{name}</span>
      </div>
    </div>
  );
}

/**
 * True once `active` has been true for longer than `ms`, for "this is taking
 * a while" messages. Once a wait has been slow it stays flagged: if the server
 * was asleep a moment ago, the next wait deserves the same explanation.
 */
function useSlowAfter(active: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && slow;
}

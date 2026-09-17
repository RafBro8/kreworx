import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { canOpen, homeFor, type Section } from "../auth/access";
import { useAuth, useMe } from "../auth/context";
import ApiStatus from "../components/ApiStatus";
import {
  CalendarIcon,
  ChartIcon,
  PeopleIcon,
  PhoneIcon,
  ReceiptIcon,
  SearchIcon,
  TruckIcon,
} from "../components/icons";
import { getDemoAccounts, type DemoAccounts, type Role } from "../lib/api";
import { initials, shortDate } from "../lib/format";

/** The rail is icon-only, so every entry carries its name for screen readers and as a hover title. */
const NAV: { section: Section; to: string; label: string; Icon: typeof CalendarIcon }[] = [
  { section: "dispatch", to: "/dispatch", label: "Dispatch", Icon: CalendarIcon },
  { section: "map", to: "/map", label: "Live map", Icon: TruckIcon },
  { section: "customers", to: "/customers", label: "Customers", Icon: PeopleIcon },
  { section: "money", to: "/money", label: "Quotes & invoices", Icon: ReceiptIcon },
  { section: "owner", to: "/owner", label: "Owner dashboard", Icon: ChartIcon },
];

function titleFor(pathname: string, role: Role): string {
  if (pathname === "/dispatch" && role === "technician") return "My day";
  return NAV.find((item) => item.to === pathname)?.label ?? "Kreworx";
}

export default function OpsLayout() {
  const me = useMe();
  const { pathname } = useLocation();
  const nav = NAV.filter((item) => canOpen(me.user.role, item.section));

  return (
    <div data-theme="ops" className="flex h-full min-h-screen">
      <aside className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-panel py-5">
        <NavLink
          to={homeFor(me.user.role)}
          aria-label="Kreworx home"
          className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-accent-line bg-accent-soft font-display text-[15px] font-bold text-accent"
        >
          K
        </NavLink>

        <nav aria-label="Sections" className="flex flex-col items-center gap-1.5">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                `flex h-[46px] w-[46px] items-center justify-center rounded-tile transition-colors ${
                  isActive ? "bg-raised text-accent" : "text-ink-faint hover:bg-raised/60 hover:text-ink-muted"
                }`
              }
            >
              <Icon />
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-5 border-b border-line bg-panel px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[21px] font-bold tracking-[-0.03em]">{titleFor(pathname, me.user.role)}</h1>
            <span className="font-mono text-[13px] text-ink-faint">{shortDate(new Date(), me.company.timezone)}</span>
          </div>

          {/* Search is chrome until there is something to search, so it is
              hidden from assistive tech rather than announced as a control
              that does nothing. */}
          <div
            aria-hidden="true"
            className="hidden max-w-[340px] flex-1 items-center gap-2.5 rounded-control border border-border bg-canvas px-3 py-2.5 text-ink-faint md:flex"
          >
            <SearchIcon size={16} />
            <span className="text-[13.5px]">Search jobs, customers, addresses</span>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden lg:block">
              <ApiStatus />
            </div>
            <span className="hidden h-6 w-px bg-border lg:block" />
            <AccountMenu />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-6">
          {/* Keyed by who is signed in: switching seats while staying on the
              same page must remount it, or it keeps the last person's data. */}
          <Outlet key={me.user.id} />
        </main>
      </div>
    </div>
  );
}

/**
 * Who you are, and — in the demo — who else you could be. Switching seats is
 * the fastest way to show that the owner, the dispatcher and a technician are
 * looking at one shared day.
 */
function AccountMenu() {
  const auth = useAuth();
  const me = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccounts | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (me.company.isDemo && !accounts) {
      getDemoAccounts().then(setAccounts).catch(() => setAccounts(null));
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, accounts, me.company.isDemo]);

  async function switchTo(userId: string, role: Role) {
    setOpen(false);
    await auth.signInAs(userId);
    navigate(homeFor(role), { replace: true });
  }

  async function leave() {
    setOpen(false);
    await auth.signOut();
    navigate("/welcome", { replace: true });
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-control px-1.5 py-1 hover:bg-raised/60"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-raised text-xs font-medium text-ink-muted">
          {initials(me.user.name)}
        </span>
        <span className="hidden flex-col items-start text-left sm:flex">
          <span className="text-[13.5px] leading-tight text-ink">{me.user.name}</span>
          <span className="text-[11px] leading-tight text-ink-faint">{me.user.title ?? me.user.role}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute top-[calc(100%+8px)] right-0 z-20 w-72 overflow-hidden rounded-card border border-border bg-surface shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          {me.company.isDemo ? (
            <div className="flex flex-col gap-1 border-b border-line p-2">
              <span className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.12em] text-ink-faint uppercase">Switch seat</span>
              {accounts ? (
                <>
                  {accounts.staff.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={person.id === me.user.id}
                      disabled={person.id === me.user.id}
                      onClick={() => void switchTo(person.id, person.role)}
                      className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left text-[13px] hover:bg-raised disabled:bg-raised/50"
                    >
                      <span className="truncate">{person.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">{person.title}</span>
                    </button>
                  ))}
                  {accounts.customer ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigate(`/portal/${accounts.customer!.portalToken}`)}
                      className="flex items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px] text-accent hover:bg-raised"
                    >
                      <PhoneIcon size={15} />
                      {accounts.customer.name}&apos;s view
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="px-2 py-1.5 text-[13px] text-ink-faint">Loading…</span>
              )}
            </div>
          ) : null}
          <div className="p-2">
            <button type="button" role="menuitem" onClick={() => void leave()} className="w-full rounded-control px-2 py-1.5 text-left text-[13px] text-ink-muted hover:bg-raised">
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

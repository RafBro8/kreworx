import { NavLink, Outlet, useLocation } from "react-router";

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

/** The rail is icon-only, so every entry carries its name for screen readers
 *  and as a hover title. */
const nav = [
  { to: "/dispatch", label: "Dispatch", Icon: CalendarIcon },
  { to: "/map", label: "Live map", Icon: TruckIcon },
  { to: "/customers", label: "Customers", Icon: PeopleIcon },
  { to: "/money", label: "Quotes & invoices", Icon: ReceiptIcon },
  { to: "/owner", label: "Owner dashboard", Icon: ChartIcon },
];

const titles: Record<string, string> = {
  "/dispatch": "Dispatch",
  "/map": "Live map",
  "/customers": "Customers",
  "/money": "Quotes & invoices",
  "/owner": "Owner dashboard",
};

function today(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function OpsLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "Kreworx";

  return (
    <div data-theme="ops" className="flex h-full min-h-screen">
      <aside className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-panel py-5">
        <NavLink
          to="/dispatch"
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
                  isActive
                    ? "bg-raised text-accent"
                    : "text-ink-faint hover:bg-raised/60 hover:text-ink-muted"
                }`
              }
            >
              <Icon />
            </NavLink>
          ))}
        </nav>

        {/* The demo lives or dies on being able to see both sides of the
            product, so the customer view is one click away rather than a
            separate URL somebody has to be told about. */}
        <NavLink
          to="/portal"
          title="Customer view"
          aria-label="Customer view"
          className="mt-auto flex h-[46px] w-[46px] items-center justify-center rounded-tile border border-dashed border-border text-ink-faint hover:text-ink-muted"
        >
          <PhoneIcon size={18} />
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-5 border-b border-line bg-panel px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[21px] font-bold tracking-[-0.03em]">{title}</h1>
            <span className="font-mono text-[13px] text-ink-faint">{today()}</span>
          </div>

          {/* Search is chrome until stage 4 gives it something to search, so it
              is hidden from assistive tech rather than announced as a control
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
            <div className="flex items-center gap-2.5">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-raised text-xs font-medium text-ink-muted">
                DM
              </span>
              <span className="text-[13.5px] text-ink-muted">Dana M.</span>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

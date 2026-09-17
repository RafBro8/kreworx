import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { canOpen, type Section } from "./access";
import { useAuth } from "./context";

export function FullPageNote({ children }: { children: ReactNode }) {
  return (
    <div data-theme="ops" className="flex min-h-screen items-center justify-center px-6">
      <span className="text-sm text-ink-muted">{children}</span>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") return <FullPageNote>Loading…</FullPageNote>;
  if (auth.status === "signedOut") return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return children;
}

/** Sends someone who types a URL their seat cannot open back to where they can work. */
export function RequireSection({ section, children }: { section: Section; children: ReactNode }) {
  const auth = useAuth();
  if (auth.status !== "signedIn") return null;
  if (!canOpen(auth.me.user.role, section)) return <Navigate to="/dispatch" replace />;
  return children;
}

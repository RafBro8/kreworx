import { Link } from "react-router";

export default function NotFound() {
  return (
    <div data-theme="ops" className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">404</span>
      <h1 className="font-display text-3xl font-bold tracking-[-0.035em]">
        There is nothing at this address
      </h1>
      <p className="max-w-md text-sm text-ink-muted">
        The page you were looking for has either moved or never existed.
      </p>
      <Link
        to="/"
        className="rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink"
      >
        Back to Kreworx
      </Link>
    </div>
  );
}

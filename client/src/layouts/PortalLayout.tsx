import { Outlet } from "react-router";

/**
 * The customer never sees the ops app. A phone-shaped column that centres
 * itself on a laptop - how it is opened from a text message, and how it is
 * shown on a big screen in a demo.
 */
export default function PortalLayout() {
  return (
    <div data-theme="customer" className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-canvas">
        <main className="flex flex-1 flex-col gap-3 p-5">
          <Outlet />
        </main>
        <footer className="px-5 pb-6 text-center text-[11px] text-ink-faint">
          <p>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9.5px] tracking-[0.08em] uppercase">
              Demo site
            </span>
          </p>
          <p className="mt-1.5">Powered by Kreworx</p>
          <p className="mt-1">
            Designed &amp; Built by{" "}
            <a
              href="https://goodlookingdigital.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline-offset-2 hover:underline"
            >
              Good Looking Digital
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

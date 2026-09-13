import { Outlet } from "react-router";

/**
 * The customer never sees the ops app. This is a phone-shaped column that
 * simply centres itself on a laptop, because that is how it will be opened
 * from a text message and how it will be demoed on a big screen.
 */
export default function PortalLayout() {
  return (
    <div data-theme="customer" className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-canvas">
        <header className="flex items-center justify-between border-b border-border bg-panel px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-accent font-display text-[13px] font-bold text-[#7fc8de]">
              N
            </span>
            <span className="text-[14.5px] font-medium">Northline Mechanical</span>
          </div>
          <span className="font-mono text-[11px] text-ink-faint">#4471</span>
        </header>

        <main className="flex flex-1 flex-col gap-3 p-5">
          <Outlet />
        </main>

        <footer className="px-5 pb-6 text-center text-[11px] text-ink-faint">
          Powered by Kreworx
        </footer>
      </div>
    </div>
  );
}

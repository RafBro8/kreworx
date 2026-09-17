import { Outlet } from "react-router";

/**
 * The customer never sees the ops app. A phone-shaped column that centres
 * itself on a laptop — how it is opened from a text message, and how it is
 * shown on a big screen in a demo.
 */
export default function PortalLayout() {
  return (
    <div data-theme="customer" className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-canvas">
        <main className="flex flex-1 flex-col gap-3 p-5">
          <Outlet />
        </main>
        <footer className="px-5 pb-6 text-center text-[11px] text-ink-faint">Powered by Kreworx</footer>
      </div>
    </div>
  );
}

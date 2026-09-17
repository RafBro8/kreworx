import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";

const summary = {
  date: "2026-09-17",
  jobsToday: 11,
  doneToday: 4,
  quotesAwaiting: { count: 3, totalCents: 826900 },
  invoicedTodayCents: 418000,
  invoicedThisWeekCents: 912300,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function fakeServer({ isDemo = true, resetFails = false } = {}) {
  const calls: string[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);

    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: "abc1234", demoMode: true, database: { connected: true, name: "kreworx" } });
    if (url === "/api/auth/me") return json({ user: { id: "u-owner", name: "Renee Castillo", role: "owner", title: "Owner" }, company: { id: "co", name: "Northline Mechanical", timezone: "America/Chicago", isDemo } });
    if (url === "/api/owner/summary") return json(summary);
    if (url === "/api/demo/reset") return resetFails ? json({ error: "This is not a demo company" }, 403) : json(null, 204);
    return json({ error: `Unhandled ${url}` }, 404);
  });
  return { fetch, calls };
}

function renderOwner() {
  return render(
    <MemoryRouter initialEntries={["/owner"]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("the owner's demo reset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks before throwing away what other people did, then rebuilds", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderOwner();

    await user.click(await screen.findByRole("button", { name: "Reset the demo" }));
    expect(screen.getByText(/Any changes made by anyone are lost/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, reset it" }));

    await waitFor(() => expect(server.calls).toContain("POST /api/demo/reset"));
    expect(await screen.findByText(/Rebuilt at/)).toBeInTheDocument();
    // The numbers are read again, because the rebuild changed them.
    expect(server.calls.filter((call) => call === "GET /api/owner/summary").length).toBeGreaterThan(1);
  });

  it("can be backed out of without resetting anything", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderOwner();

    await user.click(await screen.findByRole("button", { name: "Reset the demo" }));
    await user.click(screen.getByRole("button", { name: "Keep it as it is" }));

    expect(screen.getByRole("button", { name: "Reset the demo" })).toBeInTheDocument();
    expect(server.calls).not.toContain("POST /api/demo/reset");
  });

  it("shows the server's refusal rather than pretending it worked", async () => {
    vi.stubGlobal("fetch", fakeServer({ resetFails: true }).fetch);
    const user = userEvent.setup();
    renderOwner();

    await user.click(await screen.findByRole("button", { name: "Reset the demo" }));
    await user.click(screen.getByRole("button", { name: "Yes, reset it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This is not a demo company");
    expect(screen.queryByText(/Rebuilt at/)).toBeNull();
  });

  it("is not offered at all for a real business", async () => {
    vi.stubGlobal("fetch", fakeServer({ isDemo: false }).fetch);
    renderOwner();

    expect(await screen.findByText("$4,180")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset the demo" })).toBeNull();
  });

  it("keeps showing the deployment details", async () => {
    vi.stubGlobal("fetch", fakeServer().fetch);
    renderOwner();

    const commit = await screen.findByText("abc1234");
    expect(within(commit.closest("div")!).getByText("Commit")).toBeInTheDocument();
  });
});

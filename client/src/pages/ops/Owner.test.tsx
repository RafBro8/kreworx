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

/** Three months of trade, with a debt that has been sitting there a while. */
const booksPayload = {
  timezone: "America/Chicago",
  weeks: Array.from({ length: 12 }, (_, index) => ({
    weekStart: `2026-0${index < 4 ? 7 : index < 9 ? 8 : 9}-${String(1 + ((index * 7) % 28)).padStart(2, "0")}`,
    billedCents: 1_200_00 + index * 100_00,
    settledCents: 1_000_00 + index * 80_00,
  })),
  receivable: {
    totalCents: 2_700_00,
    ageing: [
      { key: "current", label: "0-30 days", count: 6, cents: 2_000_00 },
      { key: "thirty", label: "31-60 days", count: 2, cents: 500_00 },
      { key: "sixty", label: "60+ days", count: 1, cents: 200_00 },
    ],
    oldest: [
      { id: "i-1", number: 4301, customer: "Dale Pruitt", daysOld: 84, overdue: true, totalCents: 200_00 },
      { id: "i-2", number: 4355, customer: "Rachel Feld", daysOld: 41, overdue: true, totalCents: 250_00 },
    ],
  },
  pipeline: { out: { count: 3, cents: 8_269_00 }, won: { count: 129, cents: 36_236_00 }, answered: 154, weeks: 12 },
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
    if (url === "/api/owner/money") return json(booksPayload);
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

describe("the owner's books", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows what is owed, aged, with the oldest debts to chase", async () => {
    vi.stubGlobal("fetch", fakeServer().fetch);
    renderOwner();

    expect(await screen.findByText("Owed to you")).toBeInTheDocument();
    expect(screen.getByText("$2,700")).toBeInTheDocument();
    // Each band is named as well as shaded, so the colour is never the only clue.
    expect(screen.getByText("0-30 days")).toBeInTheDocument();
    expect(screen.getByText("60+ days")).toBeInTheDocument();

    const chase = screen.getByRole("list", { name: "Longest outstanding" });
    expect(within(chase).getByText("Dale Pruitt")).toBeInTheDocument();
    expect(within(chase).getByText("Dale Pruitt").closest("a")).toHaveAttribute("href", "/money/invoices/i-1");
  });

  it("turns answered quotes into a rate rather than a raw count", async () => {
    vi.stubGlobal("fetch", fakeServer().fetch);
    renderOwner();

    expect(await screen.findByText("84%")).toBeInTheDocument();
    expect(screen.getByText(/129 of 154 approved/)).toBeInTheDocument();
  });

  it("offers the chart's numbers as a table, for anyone who cannot read the bars", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fakeServer().fetch);
    renderOwner();

    await user.click(await screen.findByRole("button", { name: "Show the numbers" }));

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(13); // twelve weeks and a header
  });
});

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

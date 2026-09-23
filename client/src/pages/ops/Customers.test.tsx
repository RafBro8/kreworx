import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";
import type { CustomerDetail, CustomerRow } from "../../lib/api";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, disconnect: () => undefined }),
}));

const TZ = "America/Chicago";

const book: CustomerRow[] = [
  {
    id: "c-osei",
    name: "Amara Osei",
    kind: "residential",
    phone: "(708) 555-0147",
    email: null,
    towns: ["Mokena"],
    properties: 1,
    jobs: 3,
    lastVisit: "2026-09-22T15:00:00Z",
    billedCents: 84_900,
  },
  {
    id: "c-brightway",
    name: "Brightway Dental",
    kind: "commercial",
    phone: null,
    email: "office@brightway.example",
    towns: ["Tinley Park"],
    properties: 2,
    jobs: 9,
    lastVisit: "2026-09-23T12:00:00Z",
    billedCents: 1_240_00,
  },
];

const osei: CustomerDetail = {
  id: "c-osei",
  name: "Amara Osei",
  kind: "residential",
  phone: "(708) 555-0147",
  email: null,
  properties: [
    {
      id: "p-linden",
      street: "45 Linden Ave",
      city: "Mokena",
      state: "IL",
      zip: "60448",
      accessNotes: "Side gate code 4471. Dog is friendly.",
      equipment: [{ kind: "Gas furnace", make: "Goodman", model: "GMVC96", installedYear: 2013 }],
    },
  ],
  jobs: [
    {
      id: "j-4471",
      number: 4471,
      title: "No heat - priority",
      status: "en_route",
      scheduledStart: "2026-09-23T15:30:00Z",
      requestedAt: "2026-09-23T12:00:00Z",
      street: "45 Linden Ave",
      crew: { name: "Delgado", van: "VAN 08" },
      invoice: null,
      quote: { number: 4471, status: "sent", totalCents: 379_00 },
    },
    {
      id: "j-4390",
      number: 4390,
      title: "Annual service",
      status: "done",
      scheduledStart: "2026-03-14T14:00:00Z",
      requestedAt: "2026-03-10T12:00:00Z",
      street: "45 Linden Ave",
      crew: { name: "Delgado", van: "VAN 08" },
      invoice: { number: 3301, status: "paid", totalCents: 189_00 },
      quote: null,
    },
  ],
  billedCents: 84_900,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Records every customer request so the search can be checked. */
const asked: string[] = [];

function fakeApi(role = "dispatcher") {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
    if (url === "/api/auth/me")
      return json({
        user: { id: "u-dana", name: "Dana Morales", role, title: "Dispatcher" },
        company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
      });
    if (url.startsWith("/api/customers/")) return json(osei);
    if (url.startsWith("/api/customers")) {
      asked.push(url);
      const term = new URL(url, "http://x").searchParams.get("q");
      return json(term ? book.filter((row) => row.name.toLowerCase().includes(term.toLowerCase())) : book);
    }
    if (url === "/api/crews") return json([]);
    if (url.startsWith("/api/jobs")) return json({ date: "2026-09-23", timezone: TZ, demo: null, jobs: [] });
    return json({ error: `Unhandled ${url}` }, 404);
  });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

describe("the customer book", () => {
  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists everyone, with where they are and what they have spent", async () => {
    renderAt("/customers");

    expect(await screen.findByText("Amara Osei")).toBeInTheDocument();
    const row = screen.getByText("Brightway Dental").closest("tr")!;
    expect(within(row).getByText("Tinley Park")).toBeInTheDocument();
    expect(within(row).getByText("$1,240.00")).toBeInTheDocument();
    expect(within(row).getByText("9")).toBeInTheDocument();
  });

  it("searches on the server and keeps the term in the address bar", async () => {
    const user = userEvent.setup();
    renderAt("/customers");
    await screen.findByText("Brightway Dental");

    await user.type(screen.getByLabelText("Search customers"), "osei");

    await waitFor(() => expect(screen.queryByText("Brightway Dental")).toBeNull());
    expect(screen.getByText("Amara Osei")).toBeInTheDocument();
    expect(asked.at(-1)).toBe("/api/customers?q=osei");
  });

  it("asks once for a name typed in one go, not once per letter", async () => {
    const user = userEvent.setup();
    renderAt("/customers");
    await screen.findByText("Brightway Dental");
    const before = asked.length;

    await user.type(screen.getByLabelText("Search customers"), "osei");
    await waitFor(() => expect(asked.length).toBeGreaterThan(before));

    expect(asked.length - before).toBe(1);
  });

  it("says so plainly when nobody matches", async () => {
    const user = userEvent.setup();
    renderAt("/customers");
    await screen.findByText("Amara Osei");

    await user.type(screen.getByLabelText("Search customers"), "zzz");

    expect(await screen.findByText('Nobody matches "zzz".')).toBeInTheDocument();
  });

  it("opens one customer with the way in and what is installed", async () => {
    const user = userEvent.setup();
    renderAt("/customers");

    await user.click(await screen.findByText("Amara Osei"));

    expect(await screen.findByRole("heading", { name: "Amara Osei" })).toBeInTheDocument();
    expect(screen.getByText("45 Linden Ave")).toBeInTheDocument();
    expect(screen.getByText("Side gate code 4471. Dog is friendly.")).toBeInTheDocument();
    expect(screen.getByText("Goodman GMVC96 · 2013")).toBeInTheDocument();
  });

  it("shows the history newest first, with the money against each visit", async () => {
    renderAt("/customers/c-osei");

    const history = await screen.findByRole("list", { name: "Job history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("No heat - priority");
    expect(rows[0]).toHaveTextContent("$379.00 quoted");
    expect(rows[1]).toHaveTextContent("Annual service");
    expect(rows[1]).toHaveTextContent("$189.00");
  });

  it("says there is nobody at an address that does not exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/me")
          return json({
            user: { id: "u-dana", name: "Dana Morales", role: "dispatcher", title: "Dispatcher" },
            company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
          });
        if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
        if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
        if (url.startsWith("/api/customers/")) return json({ error: "Customer not found" }, 404);
        return json({ error: "no" }, 404);
      }),
    );
    renderAt("/customers/nobody");

    expect(await screen.findByText("There is no customer at that address.")).toBeInTheDocument();
  });

  it("is not offered to a technician at all", async () => {
    vi.stubGlobal("fetch", fakeApi("technician"));
    renderAt("/customers");

    // Bounced to their own day rather than shown the book.
    expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).queryByRole("link", { name: "Customers" })).toBeNull();
  });
});

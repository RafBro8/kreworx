import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import AuthProvider from "../auth/AuthProvider";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, disconnect: () => undefined }),
}));

const TZ = "America/Chicago";

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

const results = {
  query: "osei",
  jobs: [
    {
      id: "j-4471",
      number: 4471,
      title: "No heat - priority",
      status: "en_route",
      customer: "Amara Osei",
      where: "45 Linden Ave, Mokena",
      date: "2026-09-20",
    },
  ],
  customers: [{ id: "c-osei", name: "Amara Osei", kind: "residential", detail: "(708) 555-0113" }],
};

/** Enough of a job for the panel the board opens behind the search result. */
const jobDetail = {
  id: "j-4471",
  number: 4471,
  title: "No heat - priority",
  description: null,
  status: "en_route",
  priority: "high",
  scheduledStart: "2026-09-20T15:30:00Z",
  scheduledEnd: "2026-09-20T17:30:00Z",
  estimatedMinutes: 120,
  schedulingNote: null,
  requestedAt: "2026-09-18T12:00:00Z",
  crew: { id: "c-delgado", name: "Delgado", van: "VAN 08" },
  customer: { name: "Amara Osei", kind: "residential", phone: "(708) 555-0113", email: null },
  property: { street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448", accessNotes: null, equipment: [] },
  timeline: [],
  quote: null,
  invoice: null,
  portalToken: null,
  actions: { statuses: [], reschedule: false, unschedule: false },
};

/** Every URL the search box was asked for, so the debounce can be counted. */
const asked: string[] = [];

function fakeApi(role = "dispatcher") {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/search")) {
      asked.push(url);
      return json(results);
    }
    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
    if (url === "/api/auth/me")
      return json({
        user: { id: "u-1", name: "Dana Morales", role, title: "Dispatcher" },
        company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
      });
    if (url === "/api/crews") return json([]);
    if (url.startsWith("/api/jobs/unscheduled")) return json([]);
    if (url.startsWith("/api/jobs/")) return json(jobDetail);
    if (url.startsWith("/api/jobs")) return json({ date: "2026-09-25", timezone: TZ, demo: null, jobs: [] });
    if (url.startsWith("/api/customers")) return json([]);
    return json({ error: `Unhandled ${url}` }, 404);
  });
}

/** MemoryRouter never touches window.location, so the URL is read from here. */
function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/dispatch"]}>
      <AuthProvider>
        <App />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );

async function typeInSearch(text: string) {
  const user = userEvent.setup();
  renderApp();
  const box = await screen.findByRole("combobox", { name: /Search jobs/ });
  await user.type(box, text);
  return user;
}

describe("the search box", () => {
  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("says nothing until there is enough to go on", async () => {
    await typeInSearch("o");

    // One letter matches half the book, so nothing is asked and nothing shown.
    await waitFor(() => expect(asked).toHaveLength(0));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("groups what it finds, and says what each job is doing", async () => {
    await typeInSearch("osei");

    const list = await screen.findByRole("listbox", { name: "Search results" });
    expect(within(list).getByText("#4471 No heat - priority")).toBeInTheDocument();
    expect(within(list).getByText("Amara Osei · 45 Linden Ave, Mokena")).toBeInTheDocument();
    expect(within(list).getByText("En route")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
  });

  it("asks once for a burst of typing, not once a letter", async () => {
    await typeInSearch("osei");

    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    // Four keystrokes, one request - and it is for the whole word.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("q=osei");
  });

  it("opens a job on the day its board is showing", async () => {
    const user = await typeInSearch("osei");

    const list = await screen.findByRole("listbox", { name: "Search results" });
    await user.click(within(list).getByText("#4471 No heat - priority"));

    // Without the date the board lands on today and the job is not on it.
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/dispatch?date=2026-09-20&job=j-4471"),
    );
    // Choosing something puts the box away and empties it.
    expect(screen.queryByRole("listbox")).toBeNull();
    // And the board opens that job rather than merely landing near it.
    expect(await screen.findByRole("dialog", { name: "No heat - priority" })).toBeInTheDocument();
  });

  it("is driven from the keyboard, for the people who live in this screen", async () => {
    const user = await typeInSearch("osei");
    await screen.findByRole("listbox", { name: "Search results" });

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("says so plainly when there is nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/search")) return json({ query: "zzz", jobs: [], customers: [] });
        return fakeApi()(input);
      }),
    );
    await typeInSearch("zzz");

    expect(await screen.findByText('Nothing matching "zzz".')).toBeInTheDocument();
  });

  it("is not there at all for a technician", async () => {
    vi.stubGlobal("fetch", fakeApi("technician"));
    renderApp();

    // Their whole world is their own day; the book is not theirs to browse.
    await screen.findByText(/Today|Next stop|Nothing booked/);
    expect(screen.queryByRole("combobox", { name: /Search jobs/ })).toBeNull();
  });
});

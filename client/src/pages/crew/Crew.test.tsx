import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";
import type { JobDetail, JobStatus, JobSummary } from "../../lib/api";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, disconnect: () => undefined }),
}));

const TZ = "America/Chicago";

function summary(over: Partial<JobSummary>): JobSummary {
  return {
    id: "j",
    number: 0,
    title: "",
    status: "scheduled",
    priority: "normal",
    crewId: "c-delgado",
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 60,
    schedulingNote: null,
    requestedAt: "2026-09-24T12:00:00Z",
    customer: { name: "Someone", kind: "residential" },
    address: { street: "1 Street", city: "Mokena" },
    location: { lat: 41.5, lng: -87.8 },
    ...over,
  };
}

const stops: JobSummary[] = [
  summary({
    id: "j-4467", number: 4467, title: "Rooftop unit inspection", status: "done",
    scheduledStart: "2026-09-24T12:00:00Z", scheduledEnd: "2026-09-24T15:00:00Z",
    customer: { name: "Brightway Dental", kind: "commercial" }, address: { street: "900 Ridge Rd", city: "Tinley Park" },
  }),
  summary({
    id: "j-4471", number: 4471, title: "No heat - priority", status: "en_route", priority: "high",
    scheduledStart: "2026-09-24T15:30:00Z", scheduledEnd: "2026-09-24T17:30:00Z",
    customer: { name: "Amara Osei", kind: "residential" }, address: { street: "45 Linden Ave", city: "Mokena" },
  }),
  summary({
    id: "j-4474", number: 4474, title: "Thermostat swap", status: "scheduled",
    scheduledStart: "2026-09-24T18:00:00Z", scheduledEnd: "2026-09-24T19:30:00Z",
    customer: { name: "Dale Pruitt", kind: "residential" }, address: { street: "77 Harbor Ln", city: "New Lenox" },
  }),
];

const osei: JobDetail = {
  id: "j-4471", number: 4471, title: "No heat - priority", description: "Replace the cracked ignitor.",
  status: "en_route", priority: "high",
  scheduledStart: "2026-09-24T15:30:00Z", scheduledEnd: "2026-09-24T17:30:00Z",
  estimatedMinutes: 120, schedulingNote: null, requestedAt: "2026-09-24T12:00:00Z",
  crew: { id: "c-delgado", name: "Delgado", van: "VAN 08" },
  customer: { name: "Amara Osei", kind: "residential", phone: "(708) 555-0113", email: null },
  property: {
    street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448",
    accessNotes: "Side gate code 4471. Dog is friendly.",
    equipment: [{ kind: "Gas furnace", make: "Goodman", model: "GMVC96", installedYear: 2013 }],
  },
  timeline: [], quote: null, invoice: null,
  // A technician never gets the customer's private link.
  portalToken: null,
  actions: { statuses: ["on_site"], reschedule: false, unschedule: false },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

const sent: { method: string; url: string; body: unknown }[] = [];

function fakeApi(detail: JobDetail = osei) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") sent.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });

    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
    if (url === "/api/auth/me")
      return json({
        user: { id: "u-tomas", name: "Tomas Delgado", role: "technician", title: "Lead technician" },
        company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
      });
    if (url === "/api/crews") return json([]);
    if (url.match(/^\/api\/jobs\/[^/]+\/photos/)) return method === "GET" ? json([]) : json({ id: "p-1" }, 201);
    if (url.startsWith("/api/jobs/")) return method === "PATCH" ? json(null, 204) : json(detail);
    if (url.startsWith("/api/jobs")) return json({ date: "2026-09-24", timezone: TZ, demo: null, jobs: stops });
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

describe("a technician's day", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("puts the stop they are heading to above everything else", async () => {
    renderAt("/my-day");

    expect(await screen.findByText("Next stop")).toBeInTheDocument();
    // En route comes before the one merely booked, and after the one finished.
    const next = screen.getByText("Next stop").closest("a")!;
    expect(within(next).getByText("No heat - priority")).toBeInTheDocument();
    expect(within(next).getByText("45 Linden Ave")).toBeInTheDocument();
  });

  it("separates what is still to come from what is finished", async () => {
    renderAt("/my-day");

    const later = await screen.findByRole("list", { name: "Later stops" });
    expect(within(later).getByText("Thermostat swap")).toBeInTheDocument();
    expect(within(later).queryByText("Rooftop unit inspection")).toBeNull();

    const done = screen.getByRole("list", { name: "Finished stops" });
    expect(within(done).getByText("Rooftop unit inspection")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 done/)).toBeInTheDocument();
  });

  it("opens a stop from the list", async () => {
    const user = userEvent.setup();
    renderAt("/my-day");

    await user.click(await screen.findByText("Next stop"));

    expect(await screen.findByRole("heading", { name: "No heat - priority" })).toBeInTheDocument();
  });
});

describe("one stop", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("gives the way in before anything else about the work", async () => {
    renderAt("/my-day/j-4471");

    // The gate code is the difference between starting and ringing the office.
    expect(await screen.findByText(/Side gate code 4471/)).toBeInTheDocument();
    expect(screen.getByText("Goodman GMVC96 · 2013")).toBeInTheDocument();
  });

  it("hands navigation and the phone call to the phone itself", async () => {
    renderAt("/my-day/j-4471");

    const directions = await screen.findByRole("link", { name: "Directions" });
    expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=45%20Linden%20Ave%2C%20Mokena%2C%20IL%2060448",
    );
    expect(screen.getByRole("link", { name: /Call Amara/ })).toHaveAttribute("href", "tel:7085550113");
  });

  it("offers only the moves the server allows, and makes one", async () => {
    const user = userEvent.setup();
    renderAt("/my-day/j-4471");

    const actions = await screen.findByRole("group", { name: "Update status" });
    // No rescheduling, no cancelling: a technician records what happened.
    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual(["Arrived"]);

    await user.click(within(actions).getByRole("button", { name: "Arrived" }));

    await waitFor(() => expect(sent.some((call) => call.method === "PATCH")).toBe(true));
    expect(sent.find((call) => call.method === "PATCH")!.body).toEqual({ from: "en_route", to: "on_site" });
  });

  it("never shows a technician the customer's private link", async () => {
    renderAt("/my-day/j-4471");

    expect(await screen.findByRole("heading", { name: "No heat - priority" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /what Amara sees/i })).toBeNull();
  });

  it("says so plainly when the job is not theirs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/me")
          return json({
            user: { id: "u-tomas", name: "Tomas Delgado", role: "technician", title: "Lead technician" },
            company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
          });
        if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
        if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
        if (url.startsWith("/api/jobs/")) return json({ error: "Job not found" }, 404);
        return json({ error: "no" }, 404);
      }),
    );
    renderAt("/my-day/j-9999");

    expect(await screen.findByText("That job is not on your list.")).toBeInTheDocument();
  });

  it("shows no actions at all once there is nothing left to do", async () => {
    const finished: JobDetail = { ...osei, status: "done", actions: { statuses: [] as JobStatus[], reschedule: false, unschedule: false } };
    vi.stubGlobal("fetch", fakeApi(finished));
    renderAt("/my-day/j-4471");

    expect(await screen.findByRole("heading", { name: "No heat - priority" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Update status" })).toBeNull();
  });
});

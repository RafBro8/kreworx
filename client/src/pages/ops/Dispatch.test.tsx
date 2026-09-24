import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";
import type { Crew, JobDetail, JobStatus, JobSummary, Role } from "../../lib/api";

/**
 * A socket the test drives by hand. `io()` hands this back, so the tests can
 * deliver a "someone else changed the board" event without a server.
 */
const sockets: { handlers: Map<string, (payload: unknown) => void>; disconnected: boolean }[] = [];

vi.mock("socket.io-client", () => ({
  io: () => {
    const socket = { handlers: new Map<string, (payload: unknown) => void>(), disconnected: false };
    sockets.push(socket);
    return {
      on: (name: string, handler: (payload: unknown) => void) => socket.handlers.set(name, handler),
      disconnect: () => {
        socket.disconnected = true;
      },
    };
  },
}));

/** The socket the page opened, once it has asked for its ticket. */
async function liveSocket() {
  await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
  return sockets.at(-1)!;
}

const fire = (socket: Awaited<ReturnType<typeof liveSocket>>, event: string, payload?: unknown) =>
  act(() => {
    socket.handlers.get(event)?.(payload);
  });

const TZ = "America/Chicago";
// Pin "today" so the board, the date heading and the schedule form agree.
const NOW = new Date("2026-09-16T15:20:00Z"); // 10:20 AM in Mokena

const crews: Crew[] = [
  { id: "c-novak", name: "Novak", van: "VAN 03", lead: { id: "u-petra", name: "Petra Novak", title: "Lead technician" }, members: [] },
  { id: "c-delgado", name: "Delgado", van: "VAN 08", lead: { id: "u-tomas", name: "Tomas Delgado", title: "Lead technician" }, members: [] },
];

function detail(overrides: Partial<JobDetail>): JobDetail {
  return {
    id: "",
    number: 0,
    title: "",
    description: null,
    status: "scheduled",
    priority: "normal",
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 60,
    schedulingNote: null,
    requestedAt: "2026-09-16T13:42:00Z",
    crew: null,
    customer: { name: "Someone Else", kind: "residential", phone: "(708) 555-0110", email: null },
    property: { street: "1 Street", city: "Mokena", state: "IL", zip: "60448", accessNotes: null, equipment: [] },
    timeline: [],
    quote: null,
    invoice: null,
    portalToken: "token-123456789012",
    actions: { statuses: [], reschedule: false, unschedule: false },
    ...overrides,
  };
}

function fakeServer(role: Role) {
  const jobs = new Map<string, JobDetail>([
    [
      "j-4471",
      detail({
        id: "j-4471",
        number: 4471,
        title: "No heat - priority",
        status: "en_route",
        priority: "high",
        crew: { id: "c-delgado", name: "Delgado", van: "VAN 08" },
        scheduledStart: "2026-09-16T15:30:00Z",
        scheduledEnd: "2026-09-16T17:30:00Z",
        customer: { name: "Amara Osei", kind: "residential", phone: "(708) 555-0113", email: null },
        property: { street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448", accessNotes: "Side gate code 4471. Dog is friendly.", equipment: [{ kind: "Gas furnace", make: "Goodman", model: "GMVC96", installedYear: 2013 }] },
        quote: { id: "q-4471", number: 4471, status: "sent", totalCents: 37900 },
        timeline: [{ status: "en_route", at: "2026-09-16T15:08:00Z" }],
        portalToken: role === "technician" ? null : "osei-token-000000000",
      }),
    ],
    [
      "j-4474",
      detail({
        id: "j-4474",
        number: 4474,
        title: "Thermostat swap",
        status: "scheduled",
        crew: { id: "c-delgado", name: "Delgado", van: "VAN 08" },
        scheduledStart: "2026-09-16T18:00:00Z", // 1 PM in Mokena
        scheduledEnd: "2026-09-16T19:30:00Z",
        estimatedMinutes: 90,
        customer: { name: "Dale Pruitt", kind: "residential", phone: "(708) 555-0114", email: null },
        property: { street: "77 Harbor Ln", city: "New Lenox", state: "IL", zip: "60451", accessNotes: null, equipment: [] },
      }),
    ],
    [
      "j-4477",
      detail({
        id: "j-4477",
        number: 4477,
        title: "Water heater leak",
        status: "unscheduled",
        priority: "urgent",
        estimatedMinutes: 120,
        schedulingNote: "Called 8:42 AM",
        customer: { name: "Vince Marchetti", kind: "residential", phone: "(708) 555-0118", email: null },
      }),
    ],
  ]);

  const actionsFor = (job: JobDetail): JobDetail["actions"] => {
    const next: Partial<Record<JobStatus, JobStatus[]>> = { en_route: ["on_site", "scheduled"], on_site: ["awaiting_approval", "parts_on_order", "done"], unscheduled: ["cancelled"], scheduled: ["en_route", "cancelled"] };
    const statuses = (next[job.status] ?? []).filter((status) => role !== "technician" || !["scheduled", "cancelled"].includes(status));
    const office = role !== "technician";
    return { statuses, reschedule: office && ["unscheduled", "scheduled"].includes(job.status), unschedule: office && job.status === "scheduled" };
  };

  const calls: { method: string; url: string; body?: unknown }[] = [];

  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  const summary = (job: JobDetail): JobSummary => ({
    id: job.id,
    number: job.number,
    title: job.title,
    status: job.status,
    priority: job.priority,
    crewId: job.crew?.id ?? null,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    estimatedMinutes: job.estimatedMinutes,
    schedulingNote: job.schedulingNote,
    requestedAt: job.requestedAt,
    customer: job.customer ? { name: job.customer.name, kind: job.customer.kind } : null,
    address: job.property ? { street: job.property.street, city: job.property.city } : null,
    location: { lat: 41.5261, lng: -87.8892 },
  });

  type FakePhoto = { id: string; caption: string | null; contentType: string; bytes: number; takenAt: string; sharedWithCustomer: boolean };
  const photos = new Map<string, FakePhoto[]>();

  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // Photo uploads send a Blob rather than JSON.
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });

    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "a-ticket", url: null });
    if (url === "/api/auth/me") {
      const user = role === "technician" ? { id: "u-tomas", name: "Tomas Delgado", role, title: "Lead technician" } : { id: "u-dana", name: "Dana Morales", role, title: "Dispatcher" };
      return json({ user, company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: false } });
    }
    if (url === "/api/crews") return json(role === "technician" ? crews.filter((crew) => crew.id === "c-delgado") : crews);
    if (url === "/api/jobs/unscheduled") return json([...jobs.values()].filter((job) => job.status === "unscheduled").map(summary));
    if (url.startsWith("/api/jobs?") || url === "/api/jobs") {
      const date = new URL(url, "http://x").searchParams.get("date") ?? "2026-09-16";
      const onDay = [...jobs.values()].filter((job) => job.scheduledStart?.startsWith(date) && (role !== "technician" || job.crew?.id === "c-delgado"));
      // 10:20 AM on the demo clock, the moment the designs show.
      return json({ date, timezone: TZ, demo: { minutes: 620, speed: 6.67, endsInSeconds: 3600 }, jobs: onDay.map(summary) });
    }

    const photoMatch = url.match(/^\/api\/jobs\/([^/]+)\/photos(?:\?(.*))?$/);
    if (photoMatch) {
      const onJob = photos.get(photoMatch[1]!) ?? [];
      if (method === "GET") return json(onJob);
      const query = new URLSearchParams(photoMatch[2] ?? "");
      const added: FakePhoto = {
        id: "p-" + (onJob.length + 1),
        caption: query.get("caption"),
        contentType: "image/png",
        bytes: 42,
        takenAt: NOW.toISOString(),
        sharedWithCustomer: query.get("share") !== "false",
      };
      photos.set(photoMatch[1]!, [...onJob, added]);
      return json(added, 201);
    }

    const match = url.match(/^\/api\/jobs\/([^/]+)(?:\/(schedule|status|unschedule))?$/);
    const job = match ? jobs.get(match[1]!) : undefined;
    if (!job) return json({ error: "Job not found" }, 404);

    if (!match![2]) return json({ ...job, actions: actionsFor(job) });

    if (match![2] === "schedule") {
      // Novak is busy until 10 AM; anything starting before then clashes.
      if (body.crewId === "c-novak" && body.start < "2026-09-16T15:00:00.000Z") {
        return json({ error: "Novak already has #4469 Duct cleaning for Marisol Arenas from 8:00 AM to 10:00 AM" }, 409);
      }
      const crew = crews.find((candidate) => candidate.id === body.crewId)!;
      jobs.set(job.id, { ...job, status: "scheduled", schedulingNote: null, crew: { id: crew.id, name: crew.name, van: crew.van }, scheduledStart: body.start, scheduledEnd: body.end });
      return json(null, 204);
    }
    if (match![2] === "status") {
      if (body.from !== job.status) return json({ error: "This job was changed while you were looking at it" }, 409);
      jobs.set(job.id, { ...job, status: body.to, timeline: [...job.timeline, { status: body.to, at: NOW.toISOString() }] });
      return json(null, 204);
    }
    return json(null, 204);
  });

  return { fetch, calls, jobs };
}

function renderBoard(path = "/dispatch") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("the dispatch board", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    sockets.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a job to show the access notes, equipment and quote, and closes on Escape", async () => {
    const server = fakeServer("dispatcher");
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));

    const panel = await screen.findByRole("dialog", { name: "No heat - priority" });
    expect(await within(panel).findByText("Side gate code 4471. Dog is friendly.")).toBeInTheDocument();
    expect(within(panel).getByText("Goodman GMVC96 · 2013")).toBeInTheDocument();
    expect(within(panel).getByText("$379.00")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /\(708\) 555-0113/ })).toHaveAttribute("href", "tel:7085550113");
    expect(within(panel).getByRole("link", { name: "Open what Amara sees →" })).toHaveAttribute("href", "/portal/osei-token-000000000");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the server's reason when a booking clashes, then books a free slot and clears the queue", async () => {
    const server = fakeServer("dispatcher");
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderBoard();

    const queue = await screen.findByRole("region", { name: "Unscheduled" });
    await user.click(await within(queue).findByRole("button", { name: /Water heater leak/ }));
    const panel = await screen.findByRole("dialog", { name: "Water heater leak" });
    const form = await within(panel).findByRole("form", { name: "Schedule" });

    await user.selectOptions(within(form).getByLabelText("Crew"), "c-novak");
    await user.selectOptions(within(form).getByLabelText("Start"), String(9 * 60));
    await user.click(within(form).getByRole("button", { name: "Schedule job" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("Novak already has #4469 Duct cleaning");

    await user.selectOptions(within(form).getByLabelText("Start"), String(12 * 60 + 30));
    await user.click(within(form).getByRole("button", { name: "Schedule job" }));

    // 12:30 PM in Mokena is 17:30 UTC in September; the board saves business time, not laptop time.
    await waitFor(() =>
      expect(server.calls).toContainEqual({
        method: "PATCH",
        url: "/api/jobs/j-4477/schedule",
        body: { crewId: "c-novak", start: "2026-09-16T17:30:00.000Z", end: "2026-09-16T19:30:00.000Z" },
      }),
    );
    expect(await within(queue).findByText("Everything is on the board.")).toBeInTheDocument();
    expect(await within(screen.getByRole("list", { name: "Novak's jobs" })).findByText("Water heater leak")).toBeInTheDocument();
  });

  it("moves a job along from the panel and records it in the history", async () => {
    const server = fakeServer("dispatcher");
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));
    const panel = await screen.findByRole("dialog", { name: "No heat - priority" });
    await user.click(await within(panel).findByRole("button", { name: "Arrived" }));

    await waitFor(() => expect(server.calls).toContainEqual({ method: "PATCH", url: "/api/jobs/j-4471/status", body: { from: "en_route", to: "on_site" } }));
    expect(await within(panel).findByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Delgado's jobs" })).getByText(/On site/i)).toBeInTheDocument();
  });

  it("gives a technician field actions only: no scheduling, no cancel, no customer link", async () => {
    const server = fakeServer("technician");
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));
    const panel = await screen.findByRole("dialog", { name: "No heat - priority" });

    const actions = await within(panel).findByRole("group", { name: "Update status" });
    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual(["Arrived"]);
    expect(within(panel).queryByRole("form")).toBeNull();
    expect(within(panel).queryByRole("link", { name: /Open what/ })).toBeNull();
  });

  describe("dragging", () => {
    /**
     * jsdom gives every element a zero-sized box, so the board cannot work out
     * where a drop landed. Each lane and block is 1000px wide here, which makes
     * the maths easy to read: half way across a 7 AM-5 PM board is noon.
     */
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        height: 64,
        right: 1000,
        bottom: 64,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    });

    /**
     * jsdom has no DragEvent, and a plain Event drops the coordinates the board
     * needs. A MouseEvent carrying the drag's type and a dataTransfer is what
     * React hands to the handlers in a browser.
     */
    function dragEvent(type: string, clientX: number, transfer: object): MouseEvent {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      return event;
    }

    function dragTo(source: HTMLElement, lane: HTMLElement, clientX: number) {
      const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() };
      fireEvent(source, dragEvent("dragstart", 0, transfer));
      fireEvent(lane, dragEvent("dragover", clientX, transfer));
      fireEvent(lane, dragEvent("drop", clientX, transfer));
    }

    it("moves a job to another van and hour, saving business time for the dropped position", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();

      const block = await screen.findByRole("button", { name: /Thermostat swap/ });
      dragTo(block, screen.getByRole("list", { name: "Novak's jobs" }), 500);

      // Half way along the board is noon in Mokena, which is 17:00 UTC in September.
      await waitFor(() =>
        expect(server.calls).toContainEqual({
          method: "PATCH",
          url: "/api/jobs/j-4474/schedule",
          body: { crewId: "c-novak", start: "2026-09-16T17:00:00.000Z", end: "2026-09-16T18:30:00.000Z" },
        }),
      );
      expect(await within(screen.getByRole("list", { name: "Novak's jobs" })).findByText("Thermostat swap")).toBeInTheDocument();
    });

    it("drags an unscheduled job out of the queue onto a van", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();

      const queue = await screen.findByRole("region", { name: "Unscheduled" });
      const card = await within(queue).findByRole("button", { name: /Water heater leak/ });
      dragTo(card, screen.getByRole("list", { name: "Novak's jobs" }), 500);

      await waitFor(() =>
        expect(server.calls).toContainEqual({
          method: "PATCH",
          url: "/api/jobs/j-4477/schedule",
          body: { crewId: "c-novak", start: "2026-09-16T17:00:00.000Z", end: "2026-09-16T19:00:00.000Z" },
        }),
      );
      expect(await within(queue).findByText("Everything is on the board.")).toBeInTheDocument();
    });

    it("explains a clash after a drop and leaves the job where it was", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();

      const queue = await screen.findByRole("region", { name: "Unscheduled" });
      const card = await within(queue).findByRole("button", { name: /Water heater leak/ });
      // 8 AM, where Novak is already busy in this fake.
      dragTo(card, screen.getByRole("list", { name: "Novak's jobs" }), 100);

      expect(await screen.findByRole("alert")).toHaveTextContent("Novak already has #4469 Duct cleaning");
      expect(await within(queue).findByRole("button", { name: /Water heater leak/ })).toBeInTheDocument();
    });

    it("will not let a job already under way be dragged", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();

      expect(await screen.findByRole("button", { name: /No heat - priority/ })).toHaveAttribute("draggable", "false");
      expect(screen.getByRole("button", { name: /Thermostat swap/ })).toHaveAttribute("draggable", "true");
    });

    it("gives a technician no draggable jobs at all", async () => {
      const server = fakeServer("technician");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();

      expect(await screen.findByRole("button", { name: /Thermostat swap/ })).toHaveAttribute("draggable", "false");
    });
  });

  describe("the demo clock", () => {
    it("shows where the day has got to, with the now-line in the right place", async () => {
      vi.stubGlobal("fetch", fakeServer("dispatcher").fetch);
      renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });

      expect(screen.getByText("Demo clock 10:20 AM")).toBeInTheDocument();
      // 10:20 is 200 minutes into a board running 7 AM to 5 PM: a third of the way across.
      expect((document.querySelector("[data-now-line]") as HTMLElement).style.left).toContain("33.33");
    });

    it("draws no now-line on a day that is not today", async () => {
      vi.stubGlobal("fetch", fakeServer("dispatcher").fetch);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });

      await user.click(screen.getByRole("button", { name: "Next day" }));
      await screen.findByRole("heading", { name: "Thursday, September 17" });

      expect(screen.queryByText(/Demo clock/)).toBeNull();
    });
  });

  describe("live updates", () => {
    it("redraws when someone else changes today, and says it is live", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });

      const socket = await liveSocket();
      fire(socket, "connect");
      expect(await screen.findByText("Live")).toBeInTheDocument();

      // Another dispatcher marks Amara's job as arrived.
      const osei = server.jobs.get("j-4471")!;
      server.jobs.set("j-4471", { ...osei, status: "on_site" });
      fire(socket, "board:changed", { jobId: "j-4471", dates: ["2026-09-16"], reason: "status" });

      expect(await within(screen.getByRole("list", { name: "Delgado's jobs" })).findByText(/On site/i)).toBeInTheDocument();
    });

    it("refreshes a panel somebody has open when that job changes under them", async () => {
      // The board behind the panel reloaded from the first release; the panel
      // itself did not, so a dispatcher reading a job saw a stale copy until
      // they closed and reopened it.
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      const user = userEvent.setup();
      renderBoard();

      await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));
      const panel = await screen.findByRole("dialog", { name: "No heat - priority" });
      // The action offered is the clearest signal of what the panel believes.
      expect(await within(panel).findByRole("button", { name: "Arrived" })).toBeInTheDocument();

      const socket = await liveSocket();
      const osei = server.jobs.get("j-4471")!;
      server.jobs.set("j-4471", { ...osei, status: "on_site" });
      fire(socket, "board:changed", { jobId: "j-4471", dates: ["2026-09-16"], reason: "status" });

      await waitFor(() => expect(within(panel).getAllByText("On site").length).toBeGreaterThan(0));
    });

    it("leaves an open panel alone when the change is to a different job", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      const user = userEvent.setup();
      renderBoard();

      await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));
      await screen.findByRole("dialog", { name: "No heat - priority" });
      const socket = await liveSocket();

      const panelCalls = () => server.calls.filter((call) => call.url === "/api/jobs/j-4471").length;
      const boardCalls = () => server.calls.filter((call) => call.url === "/api/jobs").length;
      const [panelBefore, boardBefore] = [panelCalls(), boardCalls()];

      fire(socket, "board:changed", { jobId: "j-4469", dates: ["2026-09-16"], reason: "status" });

      // The board reloads, because the day changed; the panel does not, because
      // the job it is showing did not.
      await waitFor(() => expect(boardCalls()).toBeGreaterThan(boardBefore));
      expect(panelCalls()).toBe(panelBefore);
    });

    it("ignores a change to a day it is not showing", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });
      const socket = await liveSocket();

      const before = server.calls.filter((call) => call.url.startsWith("/api/jobs")).length;
      fire(socket, "board:changed", { jobId: "j-9999", dates: ["2026-09-24"], reason: "schedule" });

      expect(server.calls.filter((call) => call.url.startsWith("/api/jobs")).length).toBe(before);
    });

    it("reloads everything when the demo is rebuilt underneath it", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });
      const socket = await liveSocket();

      const before = server.calls.filter((call) => call.url.startsWith("/api/jobs")).length;
      fire(socket, "board:changed", { jobId: "", dates: [], reason: "demo-reset" });

      await waitFor(() => expect(server.calls.filter((call) => call.url.startsWith("/api/jobs")).length).toBeGreaterThan(before));
    });

    it("drops the Live badge when the connection goes, and closes the socket on leaving", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      const view = renderBoard();
      await screen.findByRole("list", { name: "Delgado's jobs" });

      const socket = await liveSocket();
      fire(socket, "connect");
      expect(await screen.findByText("Live")).toBeInTheDocument();

      fire(socket, "disconnect");
      await waitFor(() => expect(screen.queryByText("Live")).toBeNull());

      view.unmount();
      expect(socket.disconnected).toBe(true);
    });
  });

  it("steps to the next day and back, keeping the day in the URL's query", async () => {
    const server = fakeServer("dispatcher");
    vi.stubGlobal("fetch", server.fetch);
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByRole("heading", { name: /^Today/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next day" }));

    expect(await screen.findByRole("heading", { name: "Thursday, September 17" })).toBeInTheDocument();
    expect(server.calls.some((call) => call.url === "/api/jobs?date=2026-09-17")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByRole("heading", { name: /^Today/ })).toBeInTheDocument();
  });

  describe("photos on a job", () => {
    it("shrinks and uploads the chosen file, with its caption, and shows it on the job", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      const user = userEvent.setup();
      renderBoard();
      await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));

      const panel = await screen.findByRole("dialog", { name: "No heat - priority" });
      await user.type(within(panel).getByLabelText("Photo caption"), "Cracked ignitor");
      await user.upload(
        within(panel).getByLabelText("Choose a photo"),
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ignitor.png", { type: "image/png" }),
      );

      await waitFor(() =>
        expect(server.calls.some((call) => call.method === "POST" && call.url === "/api/jobs/j-4471/photos?caption=Cracked+ignitor")).toBe(true),
      );
      expect(await within(panel).findByAltText("Cracked ignitor")).toHaveAttribute("src", "/api/photos/p-1");
    });

    it("marks a photo office-only when the customer is not to see it", async () => {
      const server = fakeServer("dispatcher");
      vi.stubGlobal("fetch", server.fetch);
      const user = userEvent.setup();
      renderBoard();
      await user.click(await screen.findByRole("button", { name: /No heat - priority/ }));

      const panel = await screen.findByRole("dialog", { name: "No heat - priority" });
      await user.click(within(panel).getByLabelText("Show the customer"));
      await user.upload(
        within(panel).getByLabelText("Choose a photo"),
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "meter.png", { type: "image/png" }),
      );

      await waitFor(() => expect(server.calls.some((call) => call.url?.includes("share=false"))).toBe(true));
      expect(await within(panel).findByText("Office")).toBeInTheDocument();
    });
  });
});

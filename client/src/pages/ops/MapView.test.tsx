import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";
import type { JobStatus, JobSummary } from "../../lib/api";

/**
 * MapLibre needs WebGL, which jsdom has none of, so the map is replaced with a
 * stand-in that records what the page asked it to draw. The maths behind the
 * markers is tested directly in `vans.test.ts`; this checks the page puts a
 * pin where each job is, a van where each crew is, and opens the job panel
 * when one is clicked.
 */
type FakeMarker = { element: HTMLElement; lngLat: [number, number]; removed: boolean };

const drawn = {
  markers: [] as FakeMarker[],
  lines: [] as [number, number][][],
  handlers: new Map<string, () => void>(),
  fitted: 0,
  workerUrl: null as string | null,
};

vi.mock("maplibre-gl", () => {
  class Map {
    constructor(_options: unknown) {}
    on(event: string, handler: () => void) {
      drawn.handlers.set(event, handler);
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    getSource() {
      return {
        setData: (data: { features: { geometry: { coordinates: [number, number][] } }[] }) => {
          drawn.lines = data.features.map((feature) => feature.geometry.coordinates);
        },
      };
    }
    fitBounds() {
      drawn.fitted += 1;
    }
    remove() {}
  }

  class Marker {
    private record: FakeMarker;
    constructor({ element }: { element: HTMLElement }) {
      this.record = { element, lngLat: [0, 0], removed: false };
      drawn.markers.push(this.record);
    }
    setLngLat(lngLat: [number, number]) {
      this.record.lngLat = lngLat;
      return this;
    }
    addTo() {
      // Attaching it is what lets the test click it, as a browser would.
      document.body.append(this.record.element);
      return this;
    }
    getElement() {
      return this.record.element;
    }
    remove() {
      this.record.removed = true;
      this.record.element.remove();
    }
  }

  return {
    Map,
    Marker,
    NavigationControl: class {},
    GeoJSONSource: class {},
    setWorkerUrl: (url: string) => {
      drawn.workerUrl = url;
    },
  };
});

vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, disconnect: () => undefined }),
}));

const TZ = "America/Chicago";
const brightway = { lat: 41.5731, lng: -87.7845 };
const osei = { lat: 41.5261, lng: -87.8892 };

const crews = [
  { id: "c-delgado", name: "Delgado", van: "VAN 08", lead: { id: "u-tomas", name: "Tomas Delgado", title: "Lead" }, members: [] },
  { id: "c-novak", name: "Novak", van: "VAN 03", lead: { id: "u-petra", name: "Petra Novak", title: "Lead" }, members: [] },
];

function job(id: string, status: JobStatus, location: { lat: number; lng: number }, overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id,
    number: Number(id.replace(/\D/g, "")),
    title: id === "j-4471" ? "No heat - priority" : "A job",
    status,
    priority: "normal",
    crewId: "c-delgado",
    scheduledStart: "2026-09-19T15:30:00Z",
    scheduledEnd: "2026-09-19T17:30:00Z",
    estimatedMinutes: 120,
    schedulingNote: null,
    requestedAt: "2026-09-19T12:00:00Z",
    customer: { name: "Amara Osei", kind: "residential" },
    address: { street: "45 Linden Ave", city: "Mokena" },
    location,
    ...overrides,
  };
}

const jobs: JobSummary[] = [
  job("j-4467", "done", brightway, { scheduledStart: "2026-09-19T12:00:00Z", scheduledEnd: "2026-09-19T15:00:00Z", title: "Rooftop inspection" }),
  job("j-4471", "en_route", osei),
  job("j-4469", "on_site", { lat: 41.63, lng: -87.85 }, { crewId: "c-novak", title: "Duct cleaning" }),
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function fakeApi() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
    if (url === "/api/auth/me")
      return json({ user: { id: "u-dana", name: "Dana Morales", role: "dispatcher", title: "Dispatcher" }, company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true } });
    if (url === "/api/crews") return json(crews);
    // The demo clock reads 10:20: ten minutes into Tomas's drive to Amara's.
    if (url.startsWith("/api/jobs?") || url === "/api/jobs") return json({ date: "2026-09-19", timezone: TZ, demo: { minutes: 620, speed: 6, endsInSeconds: 3000 }, jobs });
    if (url.startsWith("/api/jobs/")) {
      const found = jobs.find((candidate) => url.endsWith(candidate.id))!;
      return json({ ...found, description: null, crew: { id: "c-delgado", name: "Delgado", van: "VAN 08" }, property: { street: "45 Linden Ave", city: "Mokena", state: "IL", zip: "60448", accessNotes: null, equipment: [] }, customer: { ...found.customer, phone: null, email: null }, timeline: [], quote: null, invoice: null, portalToken: null, actions: { statuses: [], reschedule: false, unschedule: false } });
    }
    return json({ error: `Unhandled ${url}` }, 404);
  });
}

/** Renders the map page and lets the stand-in map finish loading. */
async function renderMap() {
  const view = render(
    <MemoryRouter initialEntries={["/map"]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(drawn.handlers.has("load")).toBe(true));
  await act(async () => {
    drawn.handlers.get("load")!();
  });
  return view;
}

const live = () => drawn.markers.filter((marker) => !marker.removed);

describe("the live map", () => {
  beforeEach(() => {
    // The fixtures are a day in Mokena; the badge only shows for today.
    vi.useFakeTimers({ now: new Date("2026-09-19T15:20:00Z"), toFake: ["Date"] });
    drawn.markers = [];
    drawn.lines = [];
    drawn.handlers = new Map();
    drawn.fitted = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("drops a pin on every job and a van on every crew, and frames them", async () => {
    await renderMap();

    await waitFor(() => expect(live().length).toBe(5)); // three jobs, two vans
    expect(drawn.fitted).toBeGreaterThan(0);

    const pinAt = (point: { lat: number; lng: number }) =>
      live().find((marker) => marker.lngLat[0] === point.lng && marker.lngLat[1] === point.lat);
    expect(pinAt(brightway)).toBeDefined();
    expect(pinAt(osei)).toBeDefined();
  });

  it("shows the pins before the tiles arrive, so a slow map still tells you where the work is", async () => {
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    // No "load" event fired: the style has not finished.
    await waitFor(() => expect(live().length).toBe(5));
    expect(drawn.lines).toEqual([]);
  });

  it("puts Tomas's van on the road between his last job and Amara's, and draws the line", async () => {
    await renderMap();
    await waitFor(() => expect(drawn.lines.length).toBe(1));

    const [from, to] = drawn.lines[0]!;
    // Ten minutes into a twenty-minute drive: half way.
    expect(from![1]).toBeCloseTo((brightway.lat + osei.lat) / 2, 4);
    expect(to).toEqual([osei.lng, osei.lat]);
  });

  it("opens the job panel when a pin is clicked", async () => {
    const user = userEvent.setup();
    await renderMap();
    await waitFor(() => expect(live().length).toBe(5));

    const pin = live().find((marker) => marker.element.getAttribute("aria-label")?.startsWith("No heat"))!;
    await user.click(pin.element);

    expect(await screen.findByRole("dialog", { name: "No heat - priority" })).toBeInTheDocument();
  });

  it("counts the day along the bottom and offers the way back to the board", async () => {
    await renderMap();

    expect(await screen.findByText("Done today")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("On the road")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("href", "/dispatch");
    expect(screen.getByText("Demo clock 10:20 AM")).toBeInTheDocument();
  });

  it("says so, without breaking, when the tiles cannot be reached", async () => {
    await renderMap();

    await act(async () => {
      drawn.handlers.get("error")!();
    });

    expect(await screen.findByRole("status")).toHaveTextContent("map tiles could not be reached");
    expect(screen.getByText("Done today")).toBeInTheDocument();
  });

  it("hands MapLibre a worker url the build actually emits", async () => {
    // Without this the library resolves its worker next to the bundled chunk,
    // asks for a file no bundler writes, is served index.html by the
    // single-page fallback, and then never requests a single tile.
    await renderMap();

    expect(drawn.workerUrl).toBeTruthy();
    expect(drawn.workerUrl).not.toContain("index.html");
  });

  it("keeps the map off the main bundle until someone opens it", async () => {
    // The route is lazy: rendering the board must not pull the map in.
    const board = render(
      <MemoryRouter initialEntries={["/dispatch"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByRole("list", { name: /jobs$/ }).length).toBeGreaterThan(0));

    expect(drawn.handlers.size).toBe(0);
    board.unmount();
  });
});

describe("the map for a technician", () => {
  it("is not offered at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/me")
          return json({ user: { id: "u-tomas", name: "Tomas Delgado", role: "technician", title: "Lead" }, company: { id: "co", name: "Northline", timezone: TZ, isDemo: true } });
        if (url === "/api/crews") return json([crews[0]]);
        if (url.startsWith("/api/jobs")) return json({ date: "2026-09-19", timezone: TZ, demo: null, jobs });
        if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
        if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
        return json({ error: "no" }, 403);
      }),
    );

    render(
      <MemoryRouter initialEntries={["/map"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Bounced to their own day instead.
    expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).queryByRole("link", { name: "Live map" })).toBeNull();
  });
});

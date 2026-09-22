import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import AuthProvider from "./auth/AuthProvider";
import type { Crew, DemoAccounts, JobSummary, Me, OwnerSummary, PortalView, Role } from "./lib/api";

const TZ = "America/Chicago";

const staff: DemoAccounts["staff"] = [
  { id: "u-owner", name: "Renee Castillo", role: "owner", title: "Owner" },
  { id: "u-dispatch", name: "Dana Morales", role: "dispatcher", title: "Dispatcher" },
  { id: "u-tomas", name: "Tomas Delgado", role: "technician", title: "Lead technician" },
  { id: "u-jalen", name: "Jalen Brooks", role: "technician", title: "Apprentice" },
];

/** Which crew each technician rides with, as the server would resolve it. */
const crewOf: Record<string, string> = { "u-tomas": "c-delgado", "u-jalen": "c-ramirez" };

const crews: Crew[] = [
  { id: "c-ramirez", name: "Ramirez", van: "VAN 12", lead: { id: "u-luis", name: "Luis Ramirez", title: "Lead technician" }, members: [] },
  { id: "c-delgado", name: "Delgado", van: "VAN 08", lead: { id: "u-tomas", name: "Tomas Delgado", title: "Lead technician" }, members: [] },
];

const job = (overrides: Partial<JobSummary>): JobSummary => ({
  id: `j-${overrides.number}`,
  number: 0,
  title: "",
  status: "scheduled",
  priority: "normal",
  crewId: null,
  scheduledStart: null,
  scheduledEnd: null,
  estimatedMinutes: 60,
  schedulingNote: null,
  requestedAt: "2026-09-16T13:42:00Z",
  customer: { name: "Someone", kind: "residential" },
  address: { street: "1 Street", city: "Mokena" },
  location: { lat: 41.5261, lng: -87.8892 },
  ...overrides,
});

const todaysJobs: JobSummary[] = [
  job({ number: 4466, title: "AC not cooling", status: "done", crewId: "c-ramirez", scheduledStart: "2026-09-16T12:00:00Z", scheduledEnd: "2026-09-16T14:00:00Z", customer: { name: "Greg Whitaker", kind: "residential" }, address: { street: "118 Oak St", city: "Mokena" } }),
  job({ number: 4471, title: "No heat - priority", status: "en_route", priority: "high", crewId: "c-delgado", scheduledStart: "2026-09-16T15:30:00Z", scheduledEnd: "2026-09-16T17:30:00Z", customer: { name: "Amara Osei", kind: "residential" }, address: { street: "45 Linden Ave", city: "Mokena" } }),
];

const portal: PortalView = {
  company: { name: "Northline Mechanical", phone: "(708) 555-0142", timezone: TZ },
  demo: null,
  customer: { firstName: "Amara" },
  job: { number: 4471, title: "No heat - priority", status: "en_route", scheduledStart: "2026-09-16T15:30:00Z", scheduledEnd: "2026-09-16T17:30:00Z", timeline: [] },
  address: { street: "45 Linden Ave", city: "Mokena" },
  technician: { name: "Tomas Delgado", title: "Lead technician", years: 9 },
  quote: {
    number: 4471,
    status: "sent",
    findings: "The hot-surface ignitor has a hairline crack.",
    sentAt: "2026-09-16T14:58:00Z",
    validUntil: null,
    lineItems: [
      { description: "Hot-surface ignitor", detail: null, quantity: 1, unitPriceCents: 21400, waived: false, amountCents: 21400 },
      { description: "Labour - replacement and test", detail: null, quantity: 1.5, unitPriceCents: 11000, waived: false, amountCents: 16500 },
      { description: "Diagnostic visit", detail: null, quantity: 1, unitPriceCents: 8900, waived: true, amountCents: 0 },
    ],
    totalCents: 37900,
  },
};

const summary: OwnerSummary = {
  date: "2026-09-16",
  jobsToday: 11,
  doneToday: 4,
  quotesAwaiting: { count: 3, totalCents: 826900 },
  invoicedTodayCents: 418000,
  invoicedThisWeekCents: 912300,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/**
 * A stand-in for the API with a real notion of who is signed in, so the tests
 * exercise the same sign-in and role rules a person would hit.
 */
function fakeApi({ signedInAs = null as string | null, apiDown = false } = {}) {
  let session = signedInAs;
  const me = (): Me => {
    const person = staff.find((candidate) => candidate.id === session)!;
    return { user: { id: person.id, name: person.name, role: person.role, title: person.title }, company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true } };
  };
  const role = (): Role | null => staff.find((candidate) => candidate.id === session)?.role ?? null;

  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (apiDown) return Promise.reject(new TypeError("Failed to fetch"));
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true, name: "kreworx" } });
    if (url === "/api/auth/demo-accounts") return json({ company: { name: "Northline Mechanical" }, staff, customer: { name: "Amara Osei", jobTitle: "No heat - priority", portalToken: "osei-token-123456789" } });
    if (url === "/api/auth/demo" && method === "POST") {
      session = JSON.parse(String(init?.body)).userId;
      return json(null, 204);
    }
    if (url === "/api/auth/logout") {
      session = null;
      return json(null, 204);
    }
    if (url.startsWith("/api/portal/")) return url.endsWith("osei-token-123456789") ? json(portal) : json({ error: "This link has expired or is not valid" }, 404);

    if (!session) return json({ error: "Sign in to continue" }, 401);
    if (url === "/api/auth/me") return json(me());
    if (url === "/api/crews") return json(role() === "technician" ? crews.filter((crew) => crew.id === crewOf[session!]) : crews);
    if (url.startsWith("/api/jobs/unscheduled")) {
      return role() === "technician"
        ? json({ error: "Forbidden" }, 403)
        : json([job({ number: 4477, title: "Water heater leak", status: "unscheduled", priority: "urgent", schedulingNote: "Called 8:42 AM", estimatedMinutes: 120 })]);
    }
    if (url.startsWith("/api/jobs")) {
      return json({ date: "2026-09-16", timezone: TZ, jobs: role() === "technician" ? todaysJobs.filter((j) => j.crewId === crewOf[session!]) : todaysJobs });
    }
    if (url === "/api/owner/summary") return role() === "owner" ? json(summary) : json({ error: "Forbidden" }, 403);
    return json({ error: `Unhandled ${method} ${url}` }, 404);
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Kreworx", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("the welcome screen", () => {
    it("sends a signed-out visitor to pick a seat", async () => {
      renderAt("/dispatch");

      const seats = await screen.findByRole("region", { name: "Choose a seat" });
      expect(within(seats).getByRole("button", { name: /Renee Castillo/ })).toBeInTheDocument();
      expect(within(seats).getByRole("button", { name: /Dana Morales/ })).toBeInTheDocument();
      expect(within(seats).getByRole("button", { name: /Tomas Delgado/ })).toBeInTheDocument();
      expect(within(seats).getByRole("link", { name: /Amara Osei/ })).toHaveAttribute("href", "/portal/osei-token-123456789");
    });

    it("signs in as the dispatcher and opens the board", async () => {
      const user = userEvent.setup();
      renderAt("/");

      await user.click(await screen.findByRole("button", { name: /Dana Morales/ }));

      expect(await screen.findByRole("heading", { name: "Dispatch" })).toBeInTheDocument();
      expect(await screen.findByRole("list", { name: "Ramirez's jobs" })).toBeInTheDocument();
    });

    it("explains a slow start rather than looking broken when the API is down", async () => {
      vi.stubGlobal("fetch", fakeApi({ apiDown: true }));
      renderAt("/welcome");

      expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
  });

  describe("as the dispatcher", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", fakeApi({ signedInAs: "u-dispatch" }));
    });

    it("shows each crew's jobs in its own lane, with times in Mokena", async () => {
      renderAt("/dispatch");

      const delgado = await screen.findByRole("list", { name: "Delgado's jobs" });
      expect(within(delgado).getByText("No heat - priority")).toBeInTheDocument();
      expect(within(delgado).getByText("Osei · 45 Linden Ave")).toBeInTheDocument();
      // 15:30 UTC is 10:30 in Chicago in September, whatever zone the test runs in.
      expect(within(delgado).getByText("10:30-12:30 · En route")).toBeInTheDocument();

      const ramirez = screen.getByRole("list", { name: "Ramirez's jobs" });
      expect(within(ramirez).getByText("7:00-9:00 · Done")).toBeInTheDocument();
    });

    it("counts progress and lists unscheduled work", async () => {
      renderAt("/dispatch");

      const queue = await screen.findByRole("region", { name: "Unscheduled" });
      expect(await within(queue).findByText("Water heater leak")).toBeInTheDocument();
      expect(within(queue).getByText("Urgent")).toBeInTheDocument();
    });

    it("does not offer the owner dashboard, and bounces a typed-in URL", async () => {
      renderAt("/owner");

      expect(await screen.findByRole("heading", { name: "Dispatch" })).toBeInTheDocument();
      const nav = screen.getByRole("navigation", { name: "Sections" });
      expect(within(nav).queryByRole("link", { name: "Owner dashboard" })).toBeNull();
      expect(within(nav).getByRole("link", { name: "Quotes & invoices" })).toBeInTheDocument();
    });

    it("switches seats from the account menu without signing out", async () => {
      const user = userEvent.setup();
      renderAt("/dispatch");

      await user.click(await screen.findByRole("button", { name: /Dana Morales/ }));
      await user.click(await screen.findByRole("menuitemradio", { name: /Renee Castillo/ }));

      expect(await screen.findByRole("heading", { name: "Owner dashboard" })).toBeInTheDocument();
      expect(await screen.findByText("$4,180")).toBeInTheDocument();
    });

    it("reports the API state in the header", async () => {
      renderAt("/dispatch");
      expect(await screen.findByText("API connected")).toBeInTheDocument();
    });
  });

  describe("as a technician", () => {
    it("shows only their own lane and a single section", async () => {
      vi.stubGlobal("fetch", fakeApi({ signedInAs: "u-tomas" }));
      renderAt("/dispatch");

      expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument();
      expect(await screen.findByRole("list", { name: "Delgado's jobs" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Ramirez's jobs" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Unscheduled" })).toBeNull();
      expect(within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("link")).toHaveLength(1);
    });

    it("shows the new person's lane after switching between two technicians on the same page", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", fakeApi({ signedInAs: "u-tomas" }));
      renderAt("/dispatch");
      expect(await screen.findByRole("list", { name: "Delgado's jobs" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Tomas Delgado/ }));
      await user.click(await screen.findByRole("menuitemradio", { name: /Jalen Brooks/ }));

      expect(await screen.findByRole("list", { name: "Ramirez's jobs" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Delgado's jobs" })).toBeNull();
    });
  });

  describe("as the owner", () => {
    it("sees the morning's numbers", async () => {
      vi.stubGlobal("fetch", fakeApi({ signedInAs: "u-owner" }));
      renderAt("/");

      expect(await screen.findByRole("heading", { name: "Owner dashboard" })).toBeInTheDocument();
      expect(await screen.findByText("$4,180")).toBeInTheDocument();
      expect(screen.getByText("4 done so far")).toBeInTheDocument();
      expect(screen.getByText("$8,269.00 waiting on customers")).toBeInTheDocument();
    });
  });

  describe("the customer portal", () => {
    it("counts down how far out the van is while it is on the way", async () => {
      // The demo clock reads 10:15; her window opens at 10:30 in Mokena.
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) =>
          String(input).startsWith("/api/portal/")
            ? json({ ...portal, demo: { minutes: 615, speed: 7, endsInSeconds: 3000 } })
            : json({ error: "Sign in to continue" }, 401),
        ),
      );
      renderAt("/portal/osei-token-123456789");

      expect(await screen.findByText(/About 15 minutes out/)).toBeInTheDocument();
      expect(screen.getByText(/45 Linden Ave/)).toBeInTheDocument();
    });

    it("says the van is about to arrive once the window has opened", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) =>
          String(input).startsWith("/api/portal/")
            ? json({ ...portal, demo: { minutes: 632, speed: 7, endsInSeconds: 3000 } })
            : json({ error: "Sign in to continue" }, 401),
        ),
      );
      renderAt("/portal/osei-token-123456789");

      expect(await screen.findByText(/Arriving any minute now/)).toBeInTheDocument();
    });

    it("opens from the link alone, in the customer theme, with her quote", async () => {
      const { container } = renderAt("/portal/osei-token-123456789");

      expect(await screen.findByText("Arriving 10:30 AM")).toBeInTheDocument();
      expect(container.querySelector('[data-theme="customer"]')).not.toBeNull();
      expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
      expect(screen.getByText("Tomas Delgado")).toBeInTheDocument();
      expect(screen.getByText("Diagnostic visit waived")).toBeInTheDocument();
      expect(screen.getByText("−$89.00")).toBeInTheDocument();
      expect(screen.getByText("$379.00")).toBeInTheDocument();
    });

    it("says the link has expired rather than showing an error code", async () => {
      renderAt("/portal/not-a-real-token-000");
      expect(await screen.findByText("This link has expired")).toBeInTheDocument();
    });
  });

  it("offers a way back from an unknown address", () => {
    renderAt("/nothing-here");
    expect(screen.getByRole("heading", { name: /nothing at this address/i })).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import AuthProvider from "../../auth/AuthProvider";
import type { MoneyBook, MoneyDetail } from "../../lib/api";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, disconnect: () => undefined }),
}));

const TZ = "America/Chicago";

const book: MoneyBook = {
  quotes: [
    {
      id: "q-1", number: 4471, jobId: "j-4471", status: "sent", findings: null, lineItems: [],
      totalCents: 37900, sentAt: "2026-09-23T14:58:00Z", respondedAt: null, validUntil: null,
      issuedAt: null, dueAt: null, paidAt: null,
      job: { number: 4471, title: "No heat - priority" }, customer: "Amara Osei",
    },
    {
      id: "q-2", number: 4480, jobId: "j-4472", status: "draft", findings: null, lineItems: [],
      totalCents: 23300, sentAt: null, respondedAt: null, validUntil: null,
      issuedAt: null, dueAt: null, paidAt: null,
      job: { number: 4472, title: "Humidifier service" }, customer: "Adam Kowalczyk",
    },
  ],
  invoices: [
    {
      id: "i-1", number: 4466, jobId: "j-4466", status: "sent", findings: null, lineItems: [],
      totalCents: 61200, sentAt: null, respondedAt: null, validUntil: null,
      issuedAt: "2026-09-23T14:00:00Z", dueAt: "2026-10-07T14:00:00Z", paidAt: null,
      job: { number: 4466, title: "AC not cooling" }, customer: "Greg Whitaker",
    },
  ],
};

const draft: MoneyDetail = {
  id: "q-2", number: 4480, jobId: "j-4472", status: "draft", findings: "Humidifier pad furred up.",
  lineItems: [
    { kind: "part", description: "Humidifier pad", detail: null, quantity: 1, unitPriceCents: 6800, waived: false },
    { kind: "labour", description: "Fit and test", detail: null, quantity: 1.5, unitPriceCents: 11000, waived: false },
  ],
  totalCents: 23300, sentAt: null, respondedAt: null, validUntil: null, issuedAt: null, dueAt: null, paidAt: null,
  job: { id: "j-4472", number: 4472, title: "Humidifier service" }, customer: "Adam Kowalczyk", editable: true,
};

const sentQuote: MoneyDetail = { ...draft, id: "q-1", number: 4471, status: "sent", editable: false, sentAt: "2026-09-23T14:58:00Z" };

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

const sent: { method: string; url: string; body: unknown }[] = [];

function fakeApi(role = "dispatcher", document: MoneyDetail = draft) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") sent.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (url === "/api/health") return json({ status: "ok", uptimeSeconds: 1, commit: null, demoMode: true, database: { connected: true } });
    if (url === "/api/realtime/ticket") return json({ ticket: "t", url: null });
    if (url === "/api/auth/me")
      return json({
        user: { id: "u-dana", name: "Dana Morales", role, title: "Dispatcher" },
        company: { id: "co", name: "Northline Mechanical", timezone: TZ, isDemo: true },
      });
    if (url === "/api/money") return json(book);
    if (url.startsWith("/api/quotes/") && url.endsWith("/send")) return json(null, 204);
    if (url.startsWith("/api/quotes/")) return method === "PATCH" ? json(null, 204) : json(document);
    if (url.startsWith("/api/invoices/")) return method === "GET" ? json(document) : json(null, 204);
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

describe("the money page", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("leads with what is waiting and what is owed", async () => {
    renderAt("/money");

    // The lists only exist once the fetch has settled, so waiting for one is
    // what stops this reading the headline while it still says nothing.
    await screen.findByRole("list", { name: "Quotes" });
    const waiting = screen.getByText("Waiting on an answer").parentElement!;
    // Only the sent quote counts as waiting; the draft has not gone anywhere,
    // so its $233 is nowhere in this number.
    expect(within(waiting).getByText("$379.00")).toBeInTheDocument();
    expect(within(waiting).getByText("1 document")).toBeInTheDocument();

    const owed = screen.getByText("Billed and unpaid").parentElement!;
    expect(within(owed).getByText("$612.00")).toBeInTheDocument();
  });

  it("lists both kinds of paperwork with the job behind each", async () => {
    renderAt("/money");

    const quotes = await screen.findByRole("list", { name: "Quotes" });
    expect(within(quotes).getByText("Amara Osei")).toBeInTheDocument();
    expect(within(quotes).getByText("#4471 No heat - priority")).toBeInTheDocument();

    const invoices = screen.getByRole("list", { name: "Invoices" });
    expect(within(invoices).getByText("Greg Whitaker")).toBeInTheDocument();
  });

  it("is not offered to a technician", async () => {
    vi.stubGlobal("fetch", fakeApi("technician"));
    renderAt("/money");

    expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument();
  });
});

describe("writing a quote", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", fakeApi());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("totals the lines as they are typed, in whole cents", async () => {
    const user = userEvent.setup();
    renderAt("/money/quotes/q-2");

    expect(await screen.findByText("Quote Q-4480")).toBeInTheDocument();
    expect(screen.getByTestId("total")).toHaveTextContent("$233.00");

    const price = screen.getByLabelText("Line 1 price");
    await user.clear(price);
    await user.type(price, "80.25");

    expect(screen.getByTestId("total")).toHaveTextContent("$245.25");
  });

  it("saves the price as cents, never as dollars", async () => {
    const user = userEvent.setup();
    renderAt("/money/quotes/q-2");
    await screen.findByText("Quote Q-4480");

    const price = screen.getByLabelText("Line 1 price");
    await user.clear(price);
    await user.type(price, "80.25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent.some((call) => call.method === "PATCH")).toBe(true));
    const saved = sent.find((call) => call.method === "PATCH")!.body as { lineItems: { unitPriceCents: number }[] };
    expect(saved.lineItems[0]!.unitPriceCents).toBe(8025);
  });

  it("saves what is on screen before sending it, not the last saved version", async () => {
    const user = userEvent.setup();
    renderAt("/money/quotes/q-2");
    await screen.findByText("Quote Q-4480");

    await user.click(screen.getByRole("button", { name: "Send to the customer" }));

    await waitFor(() => expect(sent.some((call) => call.url.endsWith("/send"))).toBe(true));
    const order = sent.map((call) => (call.url.endsWith("/send") ? "send" : call.method));
    expect(order).toEqual(["PATCH", "send"]);
  });

  it("will not let an empty line be saved", async () => {
    const user = userEvent.setup();
    renderAt("/money/quotes/q-2");
    await screen.findByText("Quote Q-4480");

    await user.clear(screen.getByLabelText("Line 1 description"));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a sent quote as closed, with nothing to edit", async () => {
    vi.stubGlobal("fetch", fakeApi("dispatcher", sentQuote));
    renderAt("/money/quotes/q-1");

    expect(await screen.findByText(/no longer editable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByLabelText("Line 1 description")).toBeDisabled();
  });
});

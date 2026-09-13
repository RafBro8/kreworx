import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("the app shell", () => {
  beforeEach(() => {
    // The header asks the API how it is doing on every render of the ops shell.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          uptimeSeconds: 3,
          commit: null,
          database: { connected: true, name: "kreworx" },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the bare root to dispatch", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Dispatch" })).toBeInTheDocument();
  });

  it("marks the section you are in", async () => {
    renderAt("/dispatch");

    expect(screen.getByRole("link", { name: "Dispatch" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "Quotes & invoices" }));

    expect(screen.getByRole("heading", { name: "Quotes & invoices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quotes & invoices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("reports the API state in the header once it answers", async () => {
    renderAt("/dispatch");

    await waitFor(() => expect(screen.getByText("API connected")).toBeInTheDocument());
  });

  it("says so plainly when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    renderAt("/dispatch");

    await waitFor(() => expect(screen.getByText("API unreachable")).toBeInTheDocument());
  });

  it("renders the customer portal in its own theme, without the ops rail", () => {
    const { container } = renderAt("/portal");

    expect(container.querySelector('[data-theme="customer"]')).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
  });

  it("offers a way back from an unknown address", () => {
    renderAt("/nothing-here");

    expect(screen.getByRole("heading", { name: /nothing at this address/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dispatch" })).toBeInTheDocument();
  });
});

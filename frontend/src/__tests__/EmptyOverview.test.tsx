import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { EmptyOverview } from "../components/EmptyOverview";
import type { TicketListItem } from "../types";
import { BRIEF, SIMILAR, installApi, list, queue } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("empty overview", () => {
  it("shows real counts from the loaded list; each one switches the view", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Pick a ticket to start" })).toBeInTheDocument();
    const stats = screen.getByLabelText("Queue summary");
    // fixture list: T-112, T-104, T-101 open & high & unreviewed; T-103 resolved
    expect(within(stats).getByRole("button", { name: "3 open" })).toBeInTheDocument();
    expect(within(stats).getByRole("button", { name: "3 high priority" })).toBeInTheDocument();
    expect(within(stats).getByRole("button", { name: "3 need review" })).toBeInTheDocument();
    expect(within(stats).getByRole("button", { name: "1 resolved" })).toBeInTheDocument();
    await user.click(within(stats).getByRole("button", { name: "1 resolved" }));
    expect(window.location.hash).toBe("#/?view=resolved");
  });

  it("offers only the demo tickets that exist, opens one, and shows the four key hints", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    const tries = await screen.findByRole("region", { name: "Try these" });
    expect(within(tries).getAllByRole("button")).toHaveLength(3); // T-101, T-104, T-112 are in the fixture; T-108 is not
    expect(within(tries).queryByText("T-108")).not.toBeInTheDocument();
    expect(within(tries).getByText(/untrusted content is flagged, not followed/)).toBeInTheDocument();
    const keys = screen.getByRole("region", { name: "Keyboard" });
    expect(within(keys).getByText("Command palette")).toBeInTheDocument();
    expect(within(keys).getByText("All shortcuts")).toBeInTheDocument();
    await user.click(within(tries).getByRole("button", { name: /T-104/ }));
    expect(window.location.hash).toBe("#/ticket/T-104");
  });

  it("while the list loads it shows no counts, and an empty queue shows no 'Try these'", () => {
    const { rerender } = render(<EmptyOverview tickets={[]} loading onOpenTicket={() => {}} onView={() => {}} />);
    expect(screen.queryByLabelText("Queue summary")).not.toBeInTheDocument();
    rerender(<EmptyOverview tickets={[] as TicketListItem[]} loading={false} onOpenTicket={() => {}} onView={() => {}} />);
    expect(screen.queryByRole("region", { name: "Try these" })).not.toBeInTheDocument();
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("while a ticket loads", () => {
  it("the Copilot shows card skeletons, not the 'no ticket' message", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    window.location.hash = "#/ticket/T-101";
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tickets/T-101") await gate; // keep the ticket request in flight
      return realFetch(input, init);
    });
    render(<App />);
    expect(await screen.findAllByRole("status", { name: "Calling MCP tools" })).not.toHaveLength(0);
    expect(screen.queryByText(/open a ticket for a brief/)).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole("region", { name: "Ticket brief" })).toBeInTheDocument();
    expect(api.runs.length).toBeGreaterThan(0);
  });
});

describe("switching tickets", () => {
  it("never shows (or acts on) the previous ticket while the new one loads", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/tickets/T-104") await gate; // the second ticket is slow
      return realFetch(input, init);
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await queue().findByRole("button", { name: /T-101/ }));
    await screen.findByRole("heading", { name: "Checkout timed out with a pending payment" });
    await user.click(queue().getByRole("button", { name: /T-104/ }));
    expect(screen.queryByRole("heading", { name: "Checkout timed out with a pending payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark reviewed/ })).not.toBeInTheDocument();
    await user.keyboard("r"); // nothing to review yet: must not touch T-101
    expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
    release();
    expect(await screen.findByRole("heading", { name: "Locked out after replacing authenticator phone" })).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { BRIEF, DRAFT, SIMILAR, installApi, run } from "./fixtures";

/** Pretend the viewport is `width` wide: every (max-width: N px) query matches when width <= N. */
function setWidth(width: number) {
  window.matchMedia = ((q: string) => {
    const m = /max-width:\s*(\d+)px/.exec(q);
    return { matches: m ? width <= Number(m[1]) : false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}
afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error restore jsdom's lack of matchMedia
  delete window.matchMedia;
});
const base = { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: DRAFT, search_knowledge: run({ answer: "Documented guidance." }) };
const pane = () => document.getElementById("copilot-pane")!;

describe("1280px and wider", () => {
  it("shows three panes with no Copilot toggle", async () => {
    setWidth(1440);
    installApi({ runs: base });
    render(<App />);
    expect(document.querySelector(".app-shell")).toHaveAttribute("data-layout", "wide");
    expect(screen.queryByRole("button", { name: /^Copilot/ })).not.toBeInTheDocument();
    expect(pane()).not.toHaveAttribute("inert");
  });
});

describe("1024-1279px: the Copilot is a drawer", () => {
  it("starts closed and inert, opens with the top-bar button and with C, and closes with Esc", async () => {
    setWidth(1100);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    expect(document.querySelector(".app-shell")).toHaveAttribute("data-layout", "drawer");
    expect(pane()).toHaveAttribute("inert"); // off-screen controls cannot be tabbed into
    const toggle = screen.getByRole("button", { name: /^Copilot/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(pane()).not.toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("c");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("c");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("opens by itself when a new answer arrives (asked from the palette), but not when merely switching tickets", async () => {
    setWidth(1100);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: /^Copilot/ });
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox"), "zqxjv");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
  });

  it("/ opens the drawer and focuses the Ask box", async () => {
    setWidth(1100);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("/");
    await waitFor(() => expect(screen.getByLabelText("Ask a question")).toHaveFocus());
    expect(screen.getByRole("button", { name: /^Copilot/ })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("768-1023px: the queue is an icon rail", () => {
  it("shows views only; choosing one opens the queue list in a left drawer, and picking a ticket closes it", async () => {
    setWidth(900);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    expect(document.querySelector(".app-shell")).toHaveAttribute("data-layout", "rail");
    const rail = within(screen.getByRole("list", { name: "Views" }));
    expect(await rail.findByRole("button", { name: "Open 3" })).toHaveAttribute("aria-pressed", "true"); // after the list loads
    expect(rail.getByRole("button", { name: "Resolved 1" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Ticket queue list" })).not.toBeInTheDocument();

    await user.click(rail.getByRole("button", { name: "Open 3" }));
    const drawer = await screen.findByRole("dialog", { name: "Ticket queue list" });
    await user.click(within(drawer).getByRole("button", { name: /T-104/ }));
    expect(window.location.hash).toBe("#/ticket/T-104");
    expect(screen.queryByRole("dialog", { name: "Ticket queue list" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Locked out after replacing authenticator phone" })).toBeInTheDocument();
  });
});

describe("under 768px: one pane and a bottom tab bar", () => {
  it("Queue, Ticket and Copilot tabs; selecting a ticket moves to Ticket and the composer is there", async () => {
    setWidth(390);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    expect(document.querySelector(".app-shell")).toHaveAttribute("data-layout", "phone");
    const tabs = within(screen.getByRole("navigation", { name: "Sections" }));
    expect(tabs.getByRole("button", { name: "Queue" })).toHaveAttribute("aria-current", "page");
    const nav = screen.getByRole("navigation", { name: "Ticket queue" });
    expect(nav).not.toHaveAttribute("hidden");
    expect(document.querySelector("main")).toHaveAttribute("hidden");

    await user.click(await within(nav).findByRole("button", { name: /T-101/ }));
    expect(tabs.getByRole("button", { name: "Ticket" })).toHaveAttribute("aria-current", "page");
    expect(nav).toHaveAttribute("hidden");
    expect(await screen.findByRole("heading", { name: /Reply|Draft/ })).toBeInTheDocument(); // the composer
    await user.click(tabs.getByRole("button", { name: "Copilot" }));
    expect(pane()).not.toHaveAttribute("hidden");
    expect(document.querySelector("main")).toHaveAttribute("hidden");
    await user.click(tabs.getByRole("button", { name: "Queue" }));
    expect(window.location.hash).toBe("#/ticket/T-101"); // the selected ticket persists across tabs
  });

  it("a new answer switches to the Copilot tab, and C toggles between Ticket and Copilot", async () => {
    setWidth(390);
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    const tabs = within(screen.getByRole("navigation", { name: "Sections" }));
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox"), "zqxjv");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(tabs.getByRole("button", { name: "Copilot" })).toHaveAttribute("aria-current", "page"));
    await user.keyboard("c");
    expect(tabs.getByRole("button", { name: "Ticket" })).toHaveAttribute("aria-current", "page");
    await user.keyboard("c");
    expect(tabs.getByRole("button", { name: "Copilot" })).toHaveAttribute("aria-current", "page");
  });
});

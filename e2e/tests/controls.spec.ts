import { expect, test, type Page } from "@playwright/test";
import { API } from "../env";
import { answerCard, apiTicket, apiTickets, appReady, ask, openFilters, openTicket, queueIds, resetReviews } from "../helpers";

/** Every control that no earlier test exercised, with a real click or key press and an assertion on its effect.
 *  See e2e/CONTROLS.md for the full inventory and the coverage map. */
test.beforeEach(() => resetReviews());
test.afterEach(() => resetReviews());

type Seen = { runs: { action: string; query?: string; category?: string; ticket_id?: string }[]; patches: string[] };
function watch(page: Page): Seen {
  const seen: Seen = { runs: [], patches: [] };
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/assistant/run")) seen.runs.push(r.postDataJSON());
    if (r.method() === "PATCH" && r.url().includes("/reviewed")) seen.patches.push(r.url());
  });
  return seen;
}
const home = async (page: Page) => { await page.goto("/"); await appReady(page); };
const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });
const view = (page: Page, name: RegExp) => page.getByRole("button", { name });

/* ------------------------------------------------------------------ queue: sort, filters, chips */
test("Sort: 'Newest first' and 'Priority, then newest' reorder the queue exactly as the data says", async ({ page, request }) => {
  await home(page);
  await view(page, /^All tickets/).click();
  const all = (await apiTickets(request)).items as { id: string; priority: string; updated_at: string }[];
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const newest = [...all].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((t) => t.id);
  const byPriority = [...all].sort((a, b) => rank[a.priority] - rank[b.priority] || b.updated_at.localeCompare(a.updated_at)).map((t) => t.id);
  const sort = page.getByRole("combobox", { name: "Sort" });
  await sort.selectOption({ label: "Newest first" });
  await expect.poll(() => queueIds(page)).toEqual(newest);
  await sort.selectOption({ label: "Priority, then newest" });
  await expect.poll(() => queueIds(page)).toEqual(byPriority);
});

const FILTERS: [string, string][] = [
  ["High", "priority=high"], ["Medium", "priority=medium"], ["Low", "priority=low"],
  ["Account access", "category=account_access"], ["Billing", "category=billing"], ["Checkout", "category=checkout"],
  ["Exports", "category=exports"], ["Integrations", "category=integrations"], ["Notifications", "category=notifications"],
];
for (const [label, query] of FILTERS) {
  test(`Filter checkbox '${label}' narrows the queue to what GET /api/tickets?${query} returns, and unchecking restores it`, async ({ page, request }) => {
    await home(page);
    await view(page, /^All tickets/).click();
    await expect.poll(async () => (await queueIds(page)).length).toBe(12);
    const full = (await queueIds(page)).sort();
    const dialog = await openFilters(page);
    await dialog.getByRole("checkbox", { name: label, exact: true }).check();
    const want = ((await apiTickets(request, `&${query}`)).items as { id: string }[]).map((t) => t.id).sort();
    await expect.poll(async () => (await queueIds(page)).sort()).toEqual(want);
    await expect(page.getByRole("button", { name: /^Filters\s*1$/ })).toBeVisible();
    await dialog.getByRole("checkbox", { name: label, exact: true }).uncheck();
    await expect.poll(async () => (await queueIds(page)).sort()).toEqual(full);
  });
}

test("Filter checkbox 'Security' (a category with articles but no tickets) shows the empty message, and Clear filters restores", async ({ page }) => {
  await home(page);
  await view(page, /^All tickets/).click();
  const dialog = await openFilters(page);
  await dialog.getByRole("checkbox", { name: "Security", exact: true }).check();
  await expect(page.getByText("No tickets match these filters.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect.poll(async () => (await queueIds(page)).length).toBe(12);
});

test("'Clear all' in the Filters popover and the Priority chip each remove filters and restore the list", async ({ page }) => {
  await home(page);
  await view(page, /^All tickets/).click();
  const dialog = await openFilters(page);
  await dialog.getByRole("checkbox", { name: "High", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Billing", exact: true }).check();
  await expect(page.getByRole("button", { name: /^Filters\s*2$/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Clear all" }).click();
  await expect.poll(async () => (await queueIds(page)).length).toBe(12);
  await expect(page.getByRole("button", { name: /^Filters$/ })).toBeVisible();

  await dialog.getByRole("checkbox", { name: "High", exact: true }).check(); // the popover is still open after Clear all
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove filter Priority: High" }).click();
  await expect(page.getByRole("button", { name: "Remove filter Priority: High" })).toHaveCount(0);
  await expect.poll(async () => (await queueIds(page)).length).toBe(12);
});

/* ------------------------------------------------------------------ top bar */
test("the search button opens the palette with the combobox focused; Esc closes it and focus returns to the button", async ({ page }) => {
  await home(page);
  const button = page.getByRole("button", { name: /^Search tickets or run an action/ });
  await button.click();
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test("the status pill opens the tool-status popover (server, tools) and Esc closes it", async ({ page }) => {
  await home(page);
  await page.getByRole("button", { name: /Assistant ready/ }).click();
  const pop = page.getByRole("dialog", { name: "Assistant tool status" });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("Tools connected");
  await expect(pop).toContainText("get_ticket");
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
});

test("the shortcuts button opens the sheet; its Close button closes it and returns focus to the button", async ({ page }) => {
  await home(page);
  const open = page.getByRole("button", { name: "Keyboard shortcuts" });
  await open.click();
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Command palette");
  await sheet.getByRole("button", { name: "Close shortcuts" }).click();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
});

test("the theme button flips the theme, the choice survives a reload, and the label names the other theme", async ({ page }) => {
  await home(page);
  const before = await page.locator("html").getAttribute("data-theme");
  const other = before === "dark" ? "light" : "dark";
  await page.getByRole("button", { name: `Switch to ${other} theme` }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", other);
  await expect(page.getByRole("button", { name: `Switch to ${before} theme` })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", other);
});

/* ------------------------------------------------------------------ overview */
test("start screen: each stat switches the view, and a 'Try these' row opens that ticket", async ({ page }) => {
  await home(page);
  await page.getByLabel("Queue summary").getByRole("button", { name: /resolved/ }).click();
  await expect(page).toHaveURL(/view=resolved/);
  await expect.poll(async () => (await queueIds(page)).length).toBe(5);
  await page.goto("/");
  await appReady(page);
  await page.getByRole("button", { name: /T-104/ }).filter({ hasText: "MFA recovery" }).click();
  await expect(page).toHaveURL(/#\/ticket\/T-104/);
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing/ })).toBeVisible();
});

/* ------------------------------------------------------------------ copilot cards */
test("brief and similar menus: 'Refresh brief' and 'Refresh similar tickets' each fire a new run", async ({ page }) => {
  const seen = watch(page);
  await openTicket(page, "T-104", /Locked out after replacing/);
  await page.waitForLoadState("networkidle");
  const base = (a: string) => seen.runs.filter((r) => r.action === a).length;
  const b0 = base("summarize_ticket"), s0 = base("search_resolved_tickets");
  await page.getByRole("button", { name: "Ticket brief options" }).click();
  await page.getByRole("menuitem", { name: "Refresh brief" }).click();
  await expect.poll(() => base("summarize_ticket")).toBe(b0 + 1);
  await page.getByRole("button", { name: "Similar resolved options" }).click();
  await page.getByRole("menuitem", { name: "Refresh similar tickets" }).click();
  await expect.poll(() => base("search_resolved_tickets")).toBe(s0 + 1);
});

test("the brief checklist ticks locally: checkbox state changes and nothing is sent", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.waitForLoadState("networkidle");
  const seen = watch(page);
  const box = page.getByRole("checkbox", { name: "Order ID or gateway transaction reference" });
  await box.check();
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
  expect(seen.runs).toHaveLength(0);
  expect(seen.patches).toHaveLength(0);
});

test("'Show all' reveals facts beyond four and 'Show fewer' hides them (when a brief has more than four)", async ({ page }) => {
  await openTicket(page, "T-107", /Prorated subscription charge/);
  await page.waitForLoadState("networkidle");
  const more = page.getByRole("button", { name: /^Show all/ });
  if (await more.count()) {
    const items = page.locator("section[aria-labelledby=brief-h] ul").first().locator("li");
    const before = await items.count();
    await more.click();
    expect(await items.count()).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Show fewer" }).click();
    expect(await items.count()).toBe(before);
  } else {
    test.info().annotations.push({ type: "note", description: "no seeded ticket has more than four key facts; covered by CopilotPanel.test.tsx" });
  }
});

/* ------------------------------------------------------------------ answer card: menu, trace drawer, sources, limitations */
test("Answer options → View raw trace opens the drawer with the run's JSON; Copy JSON copies it; Close returns focus to the menu button", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTicket(page, "T-101", /Checkout timed out/);
  const body = await ask(page, "Can the customer retry while payment is pending?");
  const menu = answerCard(page).getByRole("button", { name: "Answer options" });
  await menu.click();
  await page.getByRole("menuitem", { name: "View raw trace" }).click();
  const drawer = page.getByRole("dialog", { name: "Raw tool trace" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Raw tool trace JSON")).toContainText(body.run_id);
  await drawer.getByRole("button", { name: "Copy JSON" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(body.run_id);
  await drawer.getByRole("button", { name: "Close raw trace" }).click();
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
});

test("the 'View source' link in the Sources list opens the drawer with the chunk text; Close and Esc both close it", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await ask(page, "Can the customer retry while payment is pending?");
  const sources = answerCard(page).getByRole("region", { name: "Sources" });
  await sources.getByRole("button", { name: "View source" }).first().click();
  const drawer = page.getByRole("dialog", { name: /^Source: KB-01#chunk-1/ });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("pending");
  await drawer.getByRole("button", { name: "Close source" }).click();
  await expect(drawer).toBeHidden();
  await sources.getByRole("button", { name: "View source" }).first().click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("the limitation toggle expands and collapses the reasons behind an insufficient-evidence answer", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await ask(page, "Does the product reimburse a bank decline fee?", "Billing");
  const toggle = answerCard(page).getByRole("button", { name: /\d+ limitation/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("the count suggestion chip runs count_tickets and shows the matching ticket as a clickable chip", async ({ page }) => {
  const seen = watch(page);
  await home(page);
  await page.getByRole("button", { name: "How many open high-priority tickets mention checkout?" }).click();
  await expect.poll(() => seen.runs.map((r) => r.action)).toContain("count_tickets");
  await expect(answerCard(page)).toContainText("T-101");
  await answerCard(page).getByRole("button", { name: "T-101" }).click();
  await expect(page).toHaveURL(/#\/ticket\/T-101/);
});

/* ------------------------------------------------------------------ submit paths and double clicks */
test("Ask: the button and the Enter key each send exactly one request; a double click on the button still sends one", async ({ page }) => {
  const seen = watch(page);
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.waitForLoadState("networkidle");
  const n = () => seen.runs.filter((r) => r.action === "search_knowledge").length;
  const box = page.getByRole("textbox", { name: "Ask a question" });
  await box.fill("Can the customer retry while payment is pending?");
  await page.getByRole("button", { name: /^Ask/ }).click();
  await expect(answerCard(page)).toBeVisible();
  expect(n()).toBe(1);
  await box.fill("What does PAYMENT_TIMEOUT mean?");
  await box.press("Enter");
  await expect.poll(n).toBe(2);
  await box.fill("How do I check for a duplicate charge?");
  await page.getByRole("button", { name: /^Ask/ }).dblclick();
  await page.waitForTimeout(800);
  expect(n()).toBe(3);
});

test("Mark reviewed: a double click writes once; Cancel on the confirm writes nothing; Confirm writes", async ({ page, request }) => {
  const seen = watch(page);
  await openTicket(page, "T-102", /Checkout shows timeout/);
  await page.getByRole("button", { name: /Mark reviewed/ }).dblclick();
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  expect(seen.patches).toHaveLength(1);

  await openTicket(page, "T-104", /Locked out after replacing/);
  await page.keyboard.press("r");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await apiTicket(request, "T-104")).reviewed_at).toBeNull();
  await page.keyboard.press("r");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => (await apiTicket(request, "T-104")).reviewed_at).not.toBeNull();
});

test("Draft: a double click on 'Draft with Copilot' makes one draft run; 'Draft again' makes a second; Reset is disabled until the draft is edited", async ({ page }) => {
  const seen = watch(page);
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.waitForLoadState("networkidle");
  const drafts = () => seen.runs.filter((r) => r.action === "draft_reply").length;
  await page.getByRole("button", { name: /Draft with Copilot/ }).dblclick();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toBeVisible();
  expect(drafts()).toBe(1);
  await expect(page.getByRole("button", { name: /Reset/ })).toBeDisabled();
  await page.getByRole("textbox", { name: "Reply draft" }).fill("edited text");
  await expect(page.getByRole("button", { name: /Reset/ })).toBeEnabled();
  await page.getByRole("button", { name: /Draft again/ }).click();
  await expect.poll(drafts).toBe(2);
});

test("Ask is disabled while an answer is in flight and re-enabled after", async ({ page }) => {
  await page.route("**/api/assistant/run", async (route) => {
    if (route.request().postDataJSON().action === "search_knowledge") await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.getByRole("textbox", { name: "Ask a question" }).fill("Can the customer retry while payment is pending?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Ask/ })).toBeDisabled();
  await expect(answerCard(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^Ask/ })).toBeEnabled();
});

/* ------------------------------------------------------------------ command palette: every command */
test("palette: arrow keys move the selection and Enter opens the selected ticket", async ({ page }) => {
  await home(page);
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  const first = await palette(page).getByRole("option", { selected: true }).innerText();
  await page.keyboard.press("ArrowDown");
  const second = await palette(page).getByRole("option", { selected: true }).innerText();
  expect(second).not.toBe(first);
  await page.keyboard.press("ArrowUp");
  expect(await palette(page).getByRole("option", { selected: true }).innerText()).toBe(first);
  await page.keyboard.type("T-108");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ticket\/T-108/);
  await expect(palette(page)).toBeHidden();
});

const COMMANDS: [string, string, (page: Page, seen: Seen) => Promise<void>][] = [
  ["Summarize current ticket", "summarize", async (_p, seen) => { await expect.poll(() => seen.runs.filter((r) => r.action === "summarize_ticket").length).toBeGreaterThan(1); }],
  ["Draft reply for current ticket", "draft reply", async (p) => { await expect(p.getByRole("textbox", { name: "Reply draft" })).toBeVisible(); }],
  ["Mark current ticket reviewed", "mark current", async (p) => { await expect(p.getByRole("button", { name: /^Reviewed/ })).toBeVisible(); }],
  ["Ask knowledge…", "ask knowledge", async (p) => { await expect(p.getByRole("textbox", { name: "Ask a question" })).toBeFocused(); }],
  ["Keyboard shortcuts", "keyboard shortcuts", async (p) => { await expect(p.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible(); }],
];
for (const [label, typed, effect] of COMMANDS) {
  test(`palette command '${label}' does what it says`, async ({ page }) => {
    const seen = watch(page);
    await openTicket(page, "T-101", /Checkout timed out/);
    await appReady(page);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    await page.keyboard.type(typed);
    await palette(page).getByRole("option", { name: new RegExp(`^${label.replace(/[.…]/g, ".?")}`) }).click();
    await expect(palette(page)).toBeHidden();
    await effect(page, seen);
  });
}

for (const [name, key, param] of [["Open", "1", ""], ["High priority", "2", "high"], ["Needs review", "3", "review"], ["Resolved", "4", "resolved"], ["All tickets", "5", "all"]] as const) {
  test(`palette 'View: ${name}' and the ${key} key both switch to that view`, async ({ page }) => {
    await home(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.type(`view ${name}`);
    await palette(page).getByRole("option", { name: new RegExp(`^View: ${name}`) }).click();
    if (param) await expect(page).toHaveURL(new RegExp(`view=${param}`));
    await expect(view(page, new RegExp(`^${name}\\s*\\d+$`))).toHaveAttribute("aria-pressed", "true");
    await page.goto("/");
    await appReady(page);
    await page.keyboard.press(key);
    await expect(view(page, new RegExp(`^${name}\\s*\\d+$`))).toHaveAttribute("aria-pressed", "true");
  });
}

test("palette 'Switch to … theme' flips the theme", async ({ page }) => {
  await home(page);
  const before = await page.locator("html").getAttribute("data-theme");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("switch theme");
  await palette(page).getByRole("option", { name: /^Switch to/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", before!);
});

test("keys: s refreshes the brief (a new summarize run) and Esc leaves the Ask box", async ({ page }) => {
  const seen = watch(page);
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.waitForLoadState("networkidle");
  const n = () => seen.runs.filter((r) => r.action === "summarize_ticket").length;
  const before = n();
  await page.keyboard.press("s");
  await expect.poll(n).toBe(before + 1);
  await page.getByRole("textbox", { name: "Ask a question" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Ask a question" })).not.toBeFocused();
});

test("1100 px (drawer layout): the Copilot toggle and the c key open and close the Copilot drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openTicket(page, "T-101", /Checkout timed out/);
  const toggle = page.getByRole("button", { name: /^Copilot/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("c");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("c");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("390 px tab bar: Queue, Ticket and Copilot each show their own pane and mark themselves current", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/ticket/T-101");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  for (const [name, visible] of [["Queue", page.getByRole("navigation", { name: "Ticket queue" })], ["Ticket", page.getByRole("main")], ["Copilot", page.getByRole("complementary", { name: "Copilot" })]] as const) {
    await tabs.getByRole("button", { name }).click();
    await expect(tabs.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
    await expect(visible).toBeVisible();
  }
});

test("Retry on a failed answer re-asks the question and shows the answer (the API-down Retry is in errors.spec)", async ({ page }) => {
  let fail = true;
  await page.route("**/api/assistant/run", (route) => {
    if (fail && route.request().postDataJSON().action === "search_knowledge") { fail = false; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "assistant_unavailable", message: "The assistant tool server is unavailable. Try again shortly.", request_id: "x1" } }) }); }
    return route.continue();
  });
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.getByRole("textbox", { name: "Ask a question" }).fill("Can the customer retry while payment is pending?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(answerCard(page).getByRole("heading", { name: /Answered from/ })).toBeVisible();
});

test("820 px (icon rail): a rail button switches the view and opens the queue drawer; Close returns to the rail", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 800 });
  await page.goto("/");
  const rail = page.getByRole("list", { name: "Views" });
  await expect(rail).toBeVisible();
  await rail.getByRole("button", { name: /^High priority/ }).click();
  await expect(page).toHaveURL(/view=high/);
  const drawer = page.getByRole("dialog", { name: "Ticket queue list" });
  await expect(drawer).toBeVisible();
  await expect.poll(async () => (await queueIds(page)).length).toBe(4);
  await drawer.getByRole("button", { name: /^Close/ }).click();
  await expect(drawer).toBeHidden();
  await expect(rail.getByRole("button", { name: /^High priority/ })).toHaveAttribute("aria-pressed", "true");
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueuePane } from "../components/QueuePane";
import type { Meta, TicketFilters, TicketListItem } from "../types";

const meta: Meta = {
  statuses: ["open", "resolved"], priorities: ["low", "medium", "high"],
  categories: ["billing", "checkout"], actions: [],
};
const tickets: TicketListItem[] = [
  { id: "T-101", title: "Checkout timed out with a pending payment", category: "checkout", priority: "high", status: "open",
    product_area: "web_checkout", created_at: "2026-11-12T09:15:00Z", updated_at: "2026-11-12T09:42:00Z", reviewed_at: null },
  { id: "T-107", title: "Prorated subscription charge", category: "billing", priority: "low", status: "resolved",
    product_area: "subscriptions", created_at: "2026-11-10T09:15:00Z", updated_at: "2026-11-10T09:42:00Z", reviewed_at: "2026-11-11T09:00:00Z" },
];

function Harness({ onSelect = () => {} }: { onSelect?: (id: string) => void }) {
  const [filters, setFilters] = useState<TicketFilters>({});
  return (
    <QueuePane meta={meta} filters={filters} onFiltersChange={setFilters} tickets={tickets} total={2}
      loading={false} error={null} onRetry={() => {}} selectedId="T-101" onSelect={onSelect} />
  );
}

describe("QueuePane", () => {
  it("shows two-line rows with priority by label and shape, status and review flags", () => {
    render(<Harness />);
    const row = screen.getByRole("button", { name: /T-101/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(row).getByRole("img", { name: "high priority" })).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Not reviewed" })).toBeInTheDocument();
    const reviewed = screen.getByRole("button", { name: /T-107/ });
    expect(within(reviewed).getByRole("img", { name: "Reviewed" })).toBeInTheDocument();
    expect(within(reviewed).getByRole("img", { name: "Resolved" })).toBeInTheDocument();
  });

  it("status segmented control reports pressed state and selecting a ticket calls back", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} />);
    const all = screen.getByRole("button", { name: "All" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: /T-107/ }));
    expect(onSelect).toHaveBeenCalledWith("T-107");
  });

  it("filters popover applies priority and category as removable chips and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(dialog).getByRole("button", { name: "High" }));
    expect(screen.getByRole("button", { name: "Remove filter: High priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("1");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter: High priority" }));
    expect(screen.queryByRole("button", { name: /Remove filter/ })).not.toBeInTheDocument();
  });
});

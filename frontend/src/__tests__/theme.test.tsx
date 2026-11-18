import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../hooks/useTheme";

function Harness() {
  const { theme, toggle } = useTheme();
  return <ThemeToggle theme={theme} onToggle={toggle} />;
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe("theme", () => {
  it("defaults to dark and the toggle switches data-theme and remembers the choice", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("support-copilot.theme")).toBe("light");
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("starts from the saved choice", () => {
    window.localStorage.setItem("support-copilot.theme", "light");
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

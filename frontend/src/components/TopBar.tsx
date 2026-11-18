import type { ReactNode } from "react";
import type { Health } from "../types";
import type { Theme } from "../hooks/useTheme";
import { SparkleIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

export type HealthState = Health | null | "unreachable";

function healthView(health: HealthState): { state: "pending" | "up" | "down"; label: ReactNode; detail: string } {
  if (health === null) return { state: "pending", label: "Checking tools…", detail: "" };
  if (health === "unreachable") return { state: "down", label: "API unreachable", detail: "" };
  const up = health.mcp.connected && health.database === "ok";
  return {
    state: up ? "up" : "down",
    // On narrow screens "connected" is dropped; "Tools (4)" is still text, so status is never colour alone.
    label: up ? (<>Tools <span className="hide-narrow">connected </span>({health.mcp.tools.length})</>) : "Assistant tools offline",
    detail: health.mcp.last_error ?? "Local MCP server over stdio",
  };
}

interface Props {
  health: HealthState;
  theme: Theme;
  onToggleTheme: () => void;
}

export function TopBar({ health, theme, onToggleTheme }: Props) {
  const view = healthView(health);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><SparkleIcon size={14} /></span>
        <span>Support Copilot</span>
      </div>
      <div className="topbar-spacer" />
      <div className={`health health-${view.state}`} role="status" title={view.detail}>
        <span className="health-dot" aria-hidden="true" />
        <span>{view.label}</span>
      </div>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}

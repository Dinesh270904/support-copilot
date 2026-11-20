import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "../hooks/useDismiss";
import type { Theme } from "../hooks/useTheme";
import type { Health } from "../types";
import { KeyboardIcon, PlugIcon, SearchIcon, SparkleIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

export type HealthState = Health | null | "unreachable";

function healthView(health: HealthState): { state: "pending" | "up" | "down"; label: ReactNode; detail: string } {
  if (health === null) return { state: "pending", label: "Checking…", detail: "" };
  if (health === "unreachable") return { state: "down", label: "Assistant offline", detail: "The API is unreachable." };
  const up = health.mcp.connected && health.database === "ok";
  return {
    state: up ? "up" : "down",
    // On narrow screens "connected" is dropped; "Tools (4)" is still text, so status is never colour alone.
    label: up ? (<><span className="pill-full">Assistant ready</span><span className="pill-short">Ready</span></>) : "Assistant offline",
    detail: health.mcp.last_error ?? "",
  };
}

interface Props {
  health: HealthState;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  /** Layouts where the Copilot is a drawer show its toggle here. */
  copilotToggle?: ReactNode;
}

export function TopBar({ health, theme, onToggleTheme, onOpenPalette, onOpenShortcuts, copilotToggle }: Props) {
  const view = healthView(health);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const info = health && health !== "unreachable" ? health : null;
  const idx = (info?.mcp.index ?? {}) as Record<string, unknown>;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><SparkleIcon size={16} weight="duotone" /></span>
        <span className="brand-name">Support Copilot</span>
      </div>
      <button type="button" className="searchbtn" onClick={onOpenPalette} title="Search tickets or run an action · ⌘K">
        <SearchIcon size={18} />
        <span className="searchbtn-text">Search tickets or run an action…</span>
        <kbd>⌘K</kbd>
      </button>
      {copilotToggle}
      <div className="popover-anchor" ref={ref}>
        <button type="button" className={`health health-${view.state}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={view.detail || "Assistant tool status"}>
          <span className="health-dot" aria-hidden="true" />
          <span>{view.label}</span>
        </button>
        {open && (
          <div className="popover health-pop" role="dialog" aria-label="Assistant tool status">
            <p className="hp-title"><PlugIcon size={14} /> {view.state === "up" ? "Tools connected" : view.state === "pending" ? "Checking…" : "Assistant offline"}</p>
            {info ? (
              <dl className="hp-grid">
                <dt>Server</dt><dd>{info.mcp.server?.name ?? "support-copilot"}{info.mcp.server?.protocol_version ? ` · MCP ${info.mcp.server.protocol_version}` : ""}</dd>
                <dt>Database</dt><dd>{info.database}</dd>
                <dt>Tools</dt><dd>{info.mcp.tools.length ? info.mcp.tools.map((t) => <code key={t}>{t}</code>) : "none"}</dd>
                {typeof idx.chunks === "number" && <><dt>Index</dt><dd className="num">{String(idx.method ?? "tfidf")} · {String(idx.chunks)} chunks · {String(idx.articles)} articles</dd></>}
                {typeof idx.min_score === "number" && <><dt>Thresholds</dt><dd className="num">min score {idx.min_score}{typeof idx.min_term_coverage === "number" ? ` · coverage ${idx.min_term_coverage}` : ""}</dd></>}
                {info.mcp.last_error && <><dt>Last error</dt><dd className="hp-error">{info.mcp.last_error}</dd></>}
              </dl>
            ) : (
              <p className="hp-note">{view.detail || "Waiting for the first health check."}</p>
            )}
          </div>
        )}
      </div>
      <button type="button" className="icon-btn kbd-help" onClick={onOpenShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts · ?"><KeyboardIcon size={18} /></button>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}

import { useState } from "react";
import type { RunState } from "../hooks/useCopilot";
import { CardMenu } from "./CardMenu";
import { CardSkeleton, ErrorNote } from "./ErrorNote";
import { FileTextIcon, ShieldIcon } from "./Icons";

const MAX_FACTS = 4;

export function TicketBriefCard({ state, onRetry, collapsed = false }: { state: RunState; onRetry: () => void; collapsed?: boolean }) {
  // Progressive disclosure: once an answer exists the brief steps back to one row; the agent can open it at any time.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !collapsed;
  const [ticked, setTicked] = useState<Record<string, boolean>>({}); // UI state only, never sent anywhere
  const [showAll, setShowAll] = useState(false);
  return (
    <section className="card" aria-labelledby="brief-h">
      <header className="card-head">
        <FileTextIcon size={15} />
        <h3 id="brief-h" title={state.response ? `Generated automatically in ${Math.round(state.response.duration_ms)} ms` : undefined}>Ticket brief</h3>
        {(collapsed || override !== null) && <button type="button" className="link-btn card-toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ticket brief`} onClick={() => setOverride(!open)}>{open ? "Hide" : "Show"}</button>}
        <CardMenu label="Ticket brief options" items={[{ label: "Refresh brief", onSelect: onRetry }]} />
      </header>
      {open && (<>
      {state.status === "loading" || state.status === "idle" ? <CardSkeleton /> : null}
      {state.status === "error" && state.error && <ErrorNote error={state.error} onRetry={onRetry} />}
      {state.status === "ok" && state.response && (() => {
        const r = state.response;
        const allFacts = r.sections.find((s) => s.title.startsWith("Key facts"))?.items ?? [];
        const facts = showAll ? allFacts : allFacts.slice(0, MAX_FACTS);
        const needed = r.sections.find((s) => s.title.startsWith("Information still needed"))?.items ?? [];
        return (
          <>
            {r.warnings.map((w) => (
              <p key={w} className="strip strip-warn"><ShieldIcon size={14} /><span>{w}</span></p>
            ))}
            <p className="card-lead">{r.answer}</p>
            {facts.length > 0 && (
              <div className="card-block">
                <h4>Key facts</h4>
                <ul className="plain-list">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
                {allFacts.length > MAX_FACTS && (
                  <button type="button" className="link-btn" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all (${allFacts.length})`}</button>
                )}
              </div>
            )}
            {needed.length > 0 && (
              <fieldset className="card-block still-needed">
                <legend>Still needed</legend>
                {needed.map((item) => (
                  <label key={item} className="check">
                    <input type="checkbox" checked={Boolean(ticked[item])} onChange={(e) => setTicked({ ...ticked, [item]: e.target.checked })} />
                    <span>{item}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        );
      })()}
      </>)}
    </section>
  );
}

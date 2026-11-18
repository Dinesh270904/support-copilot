import { useState } from "react";
import type { RunState } from "../hooks/useCopilot";
import { CardSkeleton, ErrorNote } from "./ErrorNote";
import { ShieldIcon } from "./Icons";

const MAX_FACTS = 4;

export function TicketBriefCard({ state, onRetry }: { state: RunState; onRetry: () => void }) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({}); // UI state only, never sent anywhere
  return (
    <section className="card" aria-labelledby="brief-h">
      <header className="card-head">
        <h3 id="brief-h">Ticket brief</h3>
        <span className="card-tag">auto</span>
        {state.response && <span className="card-ms num">{Math.round(state.response.duration_ms)} ms</span>}
      </header>
      {state.status === "loading" || state.status === "idle" ? <CardSkeleton /> : null}
      {state.status === "error" && state.error && <ErrorNote error={state.error} onRetry={onRetry} />}
      {state.status === "ok" && state.response && (() => {
        const r = state.response;
        const facts = (r.sections.find((s) => s.title.startsWith("Key facts"))?.items ?? []).slice(0, MAX_FACTS);
        const needed = r.sections.find((s) => s.title.startsWith("Information still needed"))?.items ?? [];
        return (
          <>
            <p className="card-lead">{r.answer}</p>
            {r.warnings.map((w) => (
              <p key={w} className="strip strip-warn"><ShieldIcon size={14} /><span>{w}</span></p>
            ))}
            {facts.length > 0 && (
              <div className="card-block">
                <h4>Key facts</h4>
                <ul className="plain-list">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
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
    </section>
  );
}

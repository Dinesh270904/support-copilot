import { useState } from "react";
import type { AssistantRunResponse } from "../types";
import { CopyIcon } from "./Icons";
import { Drawer } from "./Drawer";

interface Props {
  result: AssistantRunResponse | null;
  onClose: () => void;
  returnTo?: HTMLElement | null;
}

/** The raw tool_trace and retrieval metadata, pretty-printed, with Copy JSON. This is where "MCP" is named. */
export function TraceDrawer({ result, onClose, returnTo }: Props) {
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const json = result ? JSON.stringify({ run_id: result.run_id, tool_trace: result.tool_trace, retrieval: result.retrieval }, null, 2) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  }
  return (
    <Drawer open={result !== null} title="Raw trace" label="Raw tool trace" onClose={onClose} returnTo={returnTo}>
      <p className="src-usage">The MCP tool calls behind this answer, exactly as the API returned them.</p>
      <pre className="raw-trace" aria-label="Raw tool trace JSON">{json}</pre>
      <button type="button" className="btn" onClick={copy}><CopyIcon size={14} /> Copy JSON</button>
      <span className="composer-status" aria-live="polite">{copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed. Select the text and press ⌘C." : ""}</span>
    </Drawer>
  );
}

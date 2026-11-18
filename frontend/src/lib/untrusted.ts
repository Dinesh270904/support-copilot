import type { Message } from "../types";

/**
 * Which messages did the backend flag as instruction-like? The summary's warnings read
 * "Message 2 (customer) contains instruction-like text ...". If warnings exist but none can be
 * parsed, fall back to marking every customer message rather than silently showing none.
 */
export function untrustedPositions(warnings: string[], messages: Message[]): Set<number> {
  const flagged = new Set<number>();
  for (const w of warnings) {
    const m = w.match(/Message (\d+)\b/);
    if (m) flagged.add(Number(m[1]));
  }
  if (warnings.length > 0 && flagged.size === 0) {
    for (const msg of messages) if (msg.author === "customer") flagged.add(msg.position);
  }
  return flagged;
}

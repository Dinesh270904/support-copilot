# Controls inventory and coverage map

Generated from the live DOM by `tests/controls-inventory.spec.ts` (38 views and states; re-measured on the final tree: 2,063 element sightings, 981 in the desktop walk and 1,082 in the state walk, which the sweep's normalisation groups into 109 control families; the same walk on v1.2.3 gave 2,045 sightings and 103 families. The original 1,036 / 107 figures came from the first walk and a coarser grouping and are not reproducible) and grouped into the rows below. A row is one control or one family of identical controls.

**Covered before** = an existing e2e/Vitest test clicked or pressed it and asserted its effect (read in this audit). `UNCOVERED` = none did. A row with both is covered for one path and not another.
**Covered now** = the test that exercises it after this audit (`controls.spec.ts` for the gaps, `dead-controls.spec.ts` clicks every distinct control once, `keyboard-only.spec.ts` and `cold-start.spec.ts` run the whole flow).

**Rows: 74.** Fully covered before: 43. Partly covered before (one path only): 4. Not covered before: 25. Two rows (the last two behaviours below the queue and ticket sections, marked NEW) describe behaviour added after the first audit and had no test when added. Covered now: 74. The dead-control sweep clicks every distinct family once (100 clicks over 103 families on the final tree, 0 problems; 94 over 97 on v1.2.3). The six extra families against v1.2.3 are not new controls: five are the queue view buttons reading "Open –" etc. instead of "Open 0" when the API is down, and one is the existing Reset button now reachable because a restored draft exists in the shared tab.

| View | Control | Reached by | Expected effect | Covered before | Covered now |
|---|---|---|---|---|---|
| All | Search tickets or run an action… (button) | click, ⌘/Ctrl+K | Opens the command palette with the combobox focused; Esc closes and returns focus | keyboard.spec (key path only); click: UNCOVERED | controls.spec: search button opens the palette… |
| All | Assistant ready / Assistant offline (status pill) | click | Opens the 'Assistant tool status' popover (tools, index stats); Esc closes | errors.spec (offline popover text) | controls.spec: status pill opens the tool-status popover |
| All | Keyboard shortcuts (icon button) | click, ? | Opens the shortcuts sheet; Close returns focus to the button | keyboard.spec (? key only) | controls.spec: shortcuts button opens the sheet… |
| All | Switch to dark/light theme (icon button) | click, t, palette | Flips <html data-theme>; the choice persists after reload; label names the other theme | keyboard.spec (t key flips the theme); persistence UNCOVERED | controls.spec: theme button flips… survives a reload; palette 'Switch to … theme' |
| 1100 px | Copilot (toggle button) | click, c | Opens/closes the Copilot drawer; aria-expanded tracks it | UNCOVERED (e2e); Responsive.test.tsx (jsdom) | controls.spec: 1100 px Copilot toggle and the c key |
| 390 px | Queue / Ticket / Copilot (tab bar ×3) | click | Shows that pane and sets aria-current=page | responsive.spec (key flow through the tab bar) | controls.spec: 390 px tab bar, each pane |
| 820 px | View icon buttons (rail ×5) | click | Switches the view and opens the queue drawer; Close returns to the rail | UNCOVERED | controls.spec: 820 px icon rail |
| Queue | Open / High priority / Needs review / Resolved / All tickets (view buttons ×5) | click, keys 1–5, palette | List equals what GET /api/tickets says for that view; aria-pressed marks it | queue.spec: views show real counts / each view lists what the API says (click); keys 1–5: UNCOVERED | controls.spec: palette 'View: …' and the 1–5 keys |
| Queue (API down) | View buttons read "–" instead of 0 (×5) | state | When the ticket list cannot load the counts are unknown, not zero: they read "–" with a title, and the buttons still work | NEW: no test when added | errors.spec "API down says 'API unreachable'" (asserts "–" and never "0"); the sweep clicks all five |
| Queue | Filters (button) and its popover | click | Opens the Filters popover; Esc closes; label shows the active count | queue.spec | queue.spec; controls.spec (count label) |
| Queue | Filter checkbox: High | click | List narrows to GET /api/tickets?priority=high; uncheck restores | queue.spec | controls.spec |
| Queue | Filter checkbox: Checkout | click | List narrows to category=checkout | queue.spec | controls.spec |
| Queue | Filter checkbox: Integrations | click | List narrows to category=integrations (empty message with Resolved) | queue.spec | controls.spec |
| Queue | Filter checkboxes: Medium, Low, Account access, Billing, Exports, Notifications, Security (×7) | click | Each narrows the list to its API filter; Security shows the empty message | UNCOVERED | controls.spec (one test per checkbox, plus Security) |
| Queue | Clear all (in the popover) | click | Removes every filter and restores the list | UNCOVERED | controls.spec |
| Queue | Remove filter Priority: High (chip) | click | Removes that filter only | UNCOVERED | controls.spec |
| Queue | Remove filter Category: Checkout (chip) | click | Removes that filter only | queue.spec | queue.spec |
| Queue | Clear filters (empty state) | click | Restores the full list | queue.spec | queue.spec; controls.spec (Security) |
| Queue | Sort (select) | select | Reorders the list: 'Priority, then newest' / 'Newest first' | UNCOVERED (QueuePane.test.tsx, jsdom) | controls.spec: Sort reorders exactly as the data says |
| Queue | Queue row (ticket button) | click, Enter, j / k | Selects the ticket, sets #/ticket/<id>, loads detail; back/forward restore it | queue.spec (routing, back/forward); keyboard.spec (j/k) | same + keyboard-only.spec |
| Start | Overview stats: N open / N high priority / N need review / N resolved (×4) | click | Switches to that view | UNCOVERED | controls.spec: start screen stats |
| Start | Try these rows (×4) | click | Opens that ticket | UNCOVERED (EmptyOverview.test.tsx, jsdom) | controls.spec: start screen Try these |
| Start | Suggested question chips (empty state) | click | Runs that question / the count | answer.spec (a suggestion chip sends its question) | answer.spec; controls.spec (count chip) |
| Ticket | Mark reviewed (button) | click, r (asks first), palette | Writes reviewed_at once; shows Reviewed + time; a double click writes once | review.spec (click, r+Esc, r+Enter, idempotent) | review.spec; controls.spec (double click, palette command) |
| Ticket | Confirm / Cancel (review confirm) | click, Enter, Esc | Confirm writes; Cancel writes nothing and returns focus | review.spec (Enter and Esc paths) | controls.spec: Cancel and Confirm clicked |
| Ticket | Reviewed (disabled button) | — | Disabled once reviewed; r does nothing | review.spec | review.spec |
| Ticket | Draft with Copilot (button) | click, d, palette | Runs one draft_reply; shows the 'Draft · not sent' editor; a double click runs once | draft.spec (click and key) | controls.spec (double click, palette command) |
| Ticket | Draft again (button) | click, d | Runs a second draft_reply | UNCOVERED | controls.spec |
| Ticket | Reply draft (textarea) | type | Shows Edited and a live character count | draft.spec | draft.spec |
| Ticket | Copy draft (button) | click, Enter | Puts exactly the edited text on the clipboard | draft.spec; keyboard.spec | keyboard-only.spec; cold-start.spec |
| Ticket | Reset (button) | click | Restores the generated draft; disabled until edited | draft.spec (click) | controls.spec (disabled state) |
| Ticket | Saved reply draft (restored after a reload) | reload | The draft and the agent's edits return after a reload of the same tab; a new tab session starts without them; Reset still returns to the generated text | NEW: no test when added | limitations.spec: reload keeps it, a brand-new browser context does not; Vitest TicketPane (remount) |
| Ticket | Notes for the agent (n) (toggle) | click | Expands/collapses the agent-only notes | draft.spec | draft.spec |
| Ticket | Draft a holding reply (button) | click | Drafts a holding reply for a no-guidance ticket | draft.spec; states.spec | same |
| Copilot | Ask a question (textarea) | type, /, Enter | Enter sends one request; ≥3 and ≤500 characters; 501 disables Ask | answer.spec (validation, Enter); keyboard.spec (/) | controls.spec (Enter vs button, double click) |
| Copilot | Ask (button) | click, Enter | Sends one request; disabled while an answer is in flight | UNCOVERED | controls.spec: button, double click, disabled while in flight |
| Copilot | Scope (select) | select | Sends the chosen category with the request | expected-cases.spec | expected-cases.spec |
| Copilot | Suggested questions (chips) | click | Runs that question | answer.spec | answer.spec; cold-start.spec |
| Copilot | Ticket brief options (⋯) → Refresh brief | click | Fires a new summarize_ticket run | UNCOVERED (a11y only; CopilotPanel.test.tsx jsdom) | controls.spec |
| Copilot | Similar resolved options (⋯) → Refresh similar tickets | click | Fires a new search_resolved_tickets run | UNCOVERED | controls.spec |
| Copilot | Show / Hide ticket brief; Show / Hide similar resolved tickets | click | Collapses/expands the card; aria-expanded tracks it | copilot-scroll.spec (brief) | copilot-scroll.spec |
| Copilot | Brief checklist (checkboxes) | click, Space | Ticks locally; nothing is sent | copilot-auto.spec (tickable checklist) | controls.spec (nothing sent) |
| Copilot | Show all / Show fewer (brief facts) | click | Reveals facts beyond four (only when a brief has more) | CopilotPanel.test.tsx (jsdom); no seeded ticket exceeds four | same (documented) |
| Copilot | Similar ticket row | click | Opens that ticket | copilot-auto.spec | copilot-auto.spec |
| Copilot | Answer options (⋯) → View raw trace | click | Opens the raw-trace drawer with the run's JSON | UNCOVERED (AnswerCard.test.tsx jsdom) | controls.spec |
| Copilot | Copy JSON; Close raw trace | click | Copies the JSON; closes and returns focus to the menu button | UNCOVERED | controls.spec |
| Copilot | Citation marker ¹ ² … | hover, Tab/focus, click, Enter | Opens the preview with the quoted sentence highlighted; Esc returns focus | answer.spec | answer.spec; keyboard-only.spec |
| Copilot | Open source (in the preview) | click, Enter | Opens the source drawer | answer.spec | answer.spec; keyboard-only.spec |
| Copilot | View source (Sources list) | click | Opens the source drawer with the chunk text | UNCOVERED | controls.spec |
| Copilot | Close source (drawer ✕) | click, Esc | Closes the drawer and returns focus to the opener | answer.spec (Esc); button UNCOVERED | controls.spec; keyboard-only.spec |
| Copilot | N limitation(s) (toggle) | click | Expands/collapses the reasons behind an insufficient-evidence answer | UNCOVERED (AnswerCard.test.tsx jsdom) | controls.spec |
| Copilot | Search all categories / Widen filters | click | Re-asks without the category scope | answer.spec | answer.spec |
| Copilot | Ticket chips in a count result (T-101) | click | Opens that ticket | expected-cases.spec (count case) | controls.spec: count chip opens T-101 |
| Copilot | Retry (answer error card) | click | Re-asks and shows the answer | errors.spec (MCP unrecoverable) | controls.spec: Retry on a failed answer |
| Palette | Palette: ↑ ↓ then Enter | keys | Moves the selection; Enter opens the selected ticket | keyboard.spec (Enter, typed count) | controls.spec: arrow keys move the selection |
| Palette | Command: Summarize current ticket | click, Enter | Fires a summarize_ticket run | UNCOVERED | controls.spec |
| Palette | Command: Draft reply for current ticket | click, Enter | Shows the draft editor | UNCOVERED | controls.spec |
| Palette | Command: Mark current ticket reviewed | click, Enter | Marks the ticket reviewed (no confirm: only the r key asks) | UNCOVERED | controls.spec |
| Palette | Command: Ask knowledge… | click, Enter | Focuses the Ask box | UNCOVERED | controls.spec |
| Palette | Command: Count open high-priority tickets / 'count …' inline | type, Enter | Shows the count and its ticket ids inline | keyboard.spec; expected-cases.spec | same |
| Palette | Commands: View: Open / High / Needs review / Resolved / All (×5) | click, Enter | Switches the view | UNCOVERED | controls.spec |
| Palette | Command: Switch to … theme; Keyboard shortcuts | click, Enter | Flips the theme / opens the sheet | UNCOVERED | controls.spec |
| Sheet | Close shortcuts (✕), Esc | click, Esc | Closes the sheet | keyboard.spec (Esc) | controls.spec (button) |
| Errors | Retry (API down / queue error) | click | Retries the request; recovers when the API is back | errors.spec | errors.spec |
| Keys | j / k | key | Next / previous ticket | keyboard.spec | keyboard.spec |
| Keys | / | key | Focuses Ask (text typed straight after goes into the box) | keyboard.spec | keyboard.spec; keyboard-only.spec |
| Keys | s | key | Refreshes the brief (a new summarize run) | UNCOVERED | controls.spec |
| Keys | d | key | Drafts a reply | draft.spec; keyboard.spec | same |
| Keys | r then Enter / Esc | key | Asks first; Enter writes, Esc cancels | review.spec | review.spec |
| Keys | t, ? | key | Toggles the theme / opens the sheet | keyboard.spec | keyboard.spec; controls.spec |
| Keys | c | key | Toggles the Copilot drawer (drawer layouts) | UNCOVERED | controls.spec |
| Keys | 1–5 | key | Switches view | UNCOVERED | controls.spec |
| Keys | Esc | key | Closes overlays / leaves an input | answer.spec; keyboard.spec | same |
| Keys | Single letters ignored while typing | key | n/d/r/etc. typed in Ask do nothing else | keyboard.spec | keyboard.spec |

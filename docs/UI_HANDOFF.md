# Support Copilot: UI/UX design handoff

**Scope:** frontend only (`frontend/src`). Keep the backend, the `api.ts` request shapes and the `types.ts` contracts. Only add `matched_identifiers` and `matched_terms` to the types.
**Goal:** within 10 seconds, a reviewer sees that a grounded, cited, inspectable answer is the product, with Intercom/Plain/Linear-grade polish.

## 1. What the leaders do, and what we take

| Product | Pattern | We adopt |
|---|---|---|
| Intercom Fin Copilot | Copilot sits in the right sidebar, is ready when a conversation opens, and lets agents preview sources inside the inbox | Right Copilot panel, useful on open, with in-place source previews |
| Zendesk auto assist | The draft appears in the agent's composer; the agent edits and approves; nothing is sent automatically | Draft lives in a reply composer under the conversation, labelled "not sent" |
| Plain | Similar threads show in the sidebar; keyboard-first | Similar resolved tickets load automatically in the Copilot panel |
| Linear | Stepped near-black surfaces, depth from lightness rather than shadows, one sparing accent, 13px dense type on a 4px grid, ⌘K, visible shortcut hints, a light mode | Visual system (section 4) and keyboard model (section 6) |
| Citation UX research | Citations sit on the claim, and a citation without an excerpt preview is theater. Needs inline markers plus a sources list | Numbered inline markers with a hover/focus preview, plus a sources list |

**Differentiator:** show the retrieval transparency that competitors hide. Each source gets a score meter with the threshold tick, and a compact tool timeline is visible by default.

## 2. Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ◆ Support Copilot   [⌘K Search or run an action…]          ● Tools connected  │ 48px
├──────────────┬──────────────────────────────────────┬─────────────────────────┤
│ QUEUE 300px  │ TICKET (fluid)                       │ COPILOT 400–440px       │
│ [All][Open]… │ T-101 · High · Open    [✓ Review  R] │ Ticket brief (auto)     │
│ Filters ▾    │ Title                                │ Similar resolved (auto) │
│ ───────────  │ category · product area · created    │ ─────────────────────── │
│ ▌T-112 …     │ ──────────────────────────────────── │ Answer card (hero)      │
│ ▌T-104 …     │ conversation bubbles                 │  state · prose ¹ ²      │
│ ▌T-101 …  ●  │ ──────────────────────────────────── │  sources + score meter  │
│              │ REPLY COMPOSER                       │  tool timeline          │
│              │ Draft, not sent  [Draft with Copilot]│ ─────────────────────── │
│              │ textarea          [Copy] [Reset]     │ Ask: [question]  Scope ▾│
│              │ Notes for the agent                  │ suggestion chips        │
└──────────────┴──────────────────────────────────────┴─────────────────────────┘
```

**Changes from the current UI:**
- **No mode tabs.** Each action moves to its natural place:
  - **Summary and similar tickets:** run automatically on ticket open, as two parallel `POST /api/assistant/run` calls (`summarize_ticket`, `search_resolved_tickets`).
  - **Knowledge search:** the Ask box pinned at the bottom of the Copilot panel, with 3 suggestion chips per category. Scope defaults to the ticket's category, with "All categories" available.
  - **Draft reply:** a "Draft with Copilot" button in the reply composer. It fills the textarea, with a persistent "Draft, not sent" label and Copy/Reset. "Notes for the agent" appear under the composer.
  - **Count:** reached through the ⌘K palette and the empty-state insights.
- **Answer history:** the newest answer is on top; older answers for the same ticket stay below, collapsed (client-side only).
- **Mark reviewed:** a primary header button, also on the R key. It updates optimistically and rolls back on error.

## 3. Answer card (hero component)

```
┌──────────────────────────────────────────────────────┐
│ ✓ Answered from 2 articles               17 ms   ⋯   │
│ When checkout reports PAYMENT_TIMEOUT, first check…¹ │
│ If the payment is pending, do not ask…¹  If no       │
│ transaction exists…the customer may retry once.²     │
│ Sources                                              │
│ ① KB-01#chunk-1  Handling a checkout payment timeout │
│   similarity ▕██████▌░░│░░░▏ 0.29   │ = min score    │
│   matched: payment, timeout · id PAYMENT_TIMEOUT     │
│ ○ KB-02#chunk-1  retrieved, not quoted 0.15 (dimmed) │
│ How this was answered                                │
│ get_ticket ✓ 3ms → search_knowledge ✓ 9ms            │
│ tfidf_cosine · scope checkout · 4 candidates · k 3   │
└──────────────────────────────────────────────────────┘
```

- **Answer as prose:** render the evidence as prose with superscript markers numbered in order of first appearance. Map `[KB-xx#chunk-n]` and `[T-xxx]` tags to the markers.
- **Marker:** a `<button>` with the accessible name "Source 1: KB-01#chunk-1, <title>".
  - Hover, focus or tap opens a preview card: the title, chunk ID, score meter, and the full excerpt with the quoted sentence highlighted.
  - The card has a "View source" action that opens a right drawer (no extra fetch).
- **Score meter:** runs 0 to 0.6, with a tick at `retrieval.min_score`. Similar tickets show the bm25 value as text instead.
- **States:**
  - **Answered:** green.
  - **Insufficient:** amber, headed "Not enough evidence. Don't guess." It shows `best_score` against the threshold on the meter and the reason. A `coverage_gap` citation reads "Closest source says this is out of scope". It offers a "Draft a holding reply" chip.
  - **No results:** grey, with a hint to widen the scope.
- **Warnings:** shown as a slim amber strip with a shield icon, saying what was ignored.
- **Limitations:** a quiet "ⓘ N limitations" toggle.
- **Tool timeline:** visible by default. The ⋯ menu shows the raw `tool_trace` JSON.
- **Ticket brief card:** the summary line, up to 4 key facts, "Still needed" as tickable checkboxes (UI state only), and any untrusted-content warning.
- **Similar card:** each row shows the ID chip, the title, "Fix: …" (one line) and the matched terms. Clicking a row opens that ticket. Empty state: "No similar resolved tickets."

## 4. Visual tokens

Dark is the default. A light theme uses `[data-theme]` plus `prefers-color-scheme`, with a toggle in the top bar. Both themes must meet WCAG AA.

| Token | Dark | Light | Use |
|---|---|---|---|
| --canvas | #08090B | #F7F8FA | app background |
| --surface-1 | #0F1013 | #FFFFFF | panes |
| --surface-2 | #15171B | #F2F4F7 | cards, inputs |
| --surface-3 | #1C1F24 | #E9ECF1 | hover, selected |
| --border | #24272D | #DDE1E8 | 1px hairlines |
| --text | #F2F3F5 | #14171C | primary |
| --text-2 | #A8AEB8 | #4A515C | secondary (AA) |
| --text-3 | #7D838D | #6B7280 | labels/meta only, never body |
| --accent | #6E79E0 | #4F5BD5 | primary button, focus ring, citation markers, brand only |
| --ok / --warn / --danger | #3FB68B / #E2A33B / #E5645B | #1F8A63 / #A86A00 / #C2362C | states, priority |
| --draft | #A78BFA | #6D4FD1 | draft composer only |

- **Type:** Inter Variable at these sizes, with tabular numerals for IDs, scores and milliseconds.
  - Queue and meta: 13px / 1.4.
  - Reading text: 14px / 1.55.
  - Ticket title: 20px / 600.
- **Shape:** a 4px spacing grid; 6px radius on controls, 8px on cards, pills fully rounded.
- **Depth:** from surface steps only. Use shadows on popovers alone.
- **Accent:** at most one primary button per pane.
- **Icons:** the inline set in `Icons.tsx` at 16px, stroke 1.75. Add shield, keyboard, sun/moon, external and arrow.
- **Motion:** 150–200ms ease-out, and only when something opens or appears. Respect `prefers-reduced-motion`. No idle animation.

## 5. Queue and ticket

- **Queue row (2 lines, 56px):**
  - Line 1: priority icon, ID, truncated title, and relative time on the right.
  - Line 2: category, product area, status dot, and a ✓ when reviewed.
  - Priority shows as an icon and a 2px left bar, not a pill. Unreviewed open tickets get a small accent dot.
- **Filters:** a segmented control for status, a Filters popover for priority and category, and chips for active filters. Use `aria-pressed`.
- **Header:** ID, priority, status, title and one meta row. "Mark reviewed (R)" becomes "Reviewed <time>" with a check once done.
- **Conversation:** bubbles, with the customer on the left and the agent on the right, and day separators.
- **Instruction-like messages:** keep the text visible, inside a dashed amber border labelled "Untrusted content: not followed". Get the message position from the summary `warnings`; if that can't be parsed, mark all customer messages.

## 6. Keyboard and ⌘K palette

| Key | Action |
|---|---|
| j / k | next / previous ticket |
| / | focus the Ask box |
| d | Draft with Copilot |
| r | Mark reviewed |
| ⌘K / Ctrl K | open the palette |
| ? | shortcut sheet |
| Esc | close the popover, drawer or palette |

- **Inputs:** never capture keys while an input or textarea has focus, except Esc and ⌘K.
- **Palette:** fuzzy-matches tickets by ID and title, plus actions: Summarize, Ask knowledge, Count (e.g. "open high checkout"), Toggle theme, Filter. Each result shows its shortcut, so the palette teaches the keys.
- **Implementation:** hand-rolled, as an accessible `role="dialog"` with a listbox and `aria-activedescendant`. No new dependency.

## 7. States

- **No ticket selected:** an overview with counts by priority and status (computed client-side from the list).
  - It includes "Try these": T-101, T-104, T-108 and T-112, each with one line on what it demonstrates.
  - It also shows a mini shortcut sheet.
- **Copilot with no ticket:** Ask still works across all categories, alongside count suggestions.
- **Loading:** skeleton cards shaped like the results, with "Calling MCP tools…". Never fake streaming or step progress; show the real timeline only when the response arrives.
- **Errors:** shown inline in the card that failed; other cards keep working.
  - 422: amber, with the field message.
  - 503 and 504: red, "Tool server unavailable", with a Retry button.
  - 404: "Ticket not found".
  - Always show the request ID.

## 8. Responsive

| Width | Layout |
|---|---|
| ≥1280px | three panes |
| 1024–1279px | queue + ticket; Copilot becomes a right drawer, toggled with the C key and the top-bar button, and auto-opens when an answer arrives |
| <768px | one pane with a bottom tab bar (Queue / Ticket / Copilot); the selected ticket persists across tabs |

## 9. Accessibility (must pass)

- WCAG AA contrast in both themes. Check `--text-2` and `--text-3` on every surface they sit on.
- A visible 2px accent focus ring with offset.
- Landmarks: `nav` for the queue, `main` for the ticket, `aside` for Copilot. The palette and drawer are dialogs that trap focus and restore it on close.
- Citation markers are buttons. Their previews open on focus and close on Esc.
- `aria-live="polite"` on the Copilot results.
- No action is available on hover only.

## 10. Constraints

- **Stack:** React 19 + TypeScript + Vite + plain CSS custom properties. CSS modules are allowed.
- **No new dependencies:** no UI framework, no Tailwind, no new runtime packages.
- **State:** new state (answer history, checklist ticks, theme) is client-side only. Save the theme to `localStorage` inside try/catch.
- **Components:**
  - TopBar, CommandPalette
  - QueuePane, QueueRow
  - TicketPane, Conversation, ReplyComposer
  - CopilotPanel, TicketBriefCard, SimilarCard, AnswerCard
  - CitationMarker, SourcePreview, ScoreMeter, ToolTimeline, AskBox
  - EmptyOverview, ShortcutSheet
  - hooks: useHotkeys, useTheme
- **README note:** auto-running the brief and similar tickets adds 2 assistant runs per ticket opened, visible in `/api/assistant/runs`.

## 11. Tests (Vitest + Testing Library)

Adapt the existing 5 tests, then add these:
1. Opening a ticket triggers `summarize_ticket` and `search_resolved_tickets`, and renders the brief and similar cards.
2. An answer renders superscript markers. Focusing one shows a preview with the highlighted sentence and the score.
3. Insufficient evidence shows the amber state, the meter with its threshold tick, and no source markers.
4. "Draft with Copilot" fills the composer with "Draft, not sent". Editing and copying both work.
5. j and k change the selection, but are ignored while typing in the Ask box.
6. ⌘K opens the palette; typing "T-104" and pressing Enter opens that ticket.
7. The theme toggle switches `data-theme`.

`npx tsc -b`, `npx vitest run` and `npx vite build` must all be clean.

## 12. Process and quality bar

1. **Build order:**
   1. tokens and theme
   2. shell layout
   3. queue
   4. ticket and composer
   5. Copilot cards
   6. answer card and citations
   7. palette and hotkeys
   8. states
   9. responsive
2. **After each step:**
   - take Playwright screenshots at 1440×900, 1100×800 and 390×844, in both themes
   - critique them against this spec and fix what's off
   - show me the screenshots
   - commit
3. **Final checks:**
   - A stranger can see within 10 seconds that answers are grounded and where every sentence came from.
   - No text falls below AA, nothing is truncated or overlapping at any width, and every state has been seen in a screenshot: loading, answered, insufficient, no results, 422, 503, empty queue, no ticket.
   - The demo path works by keyboard alone:
     1. open T-101 and see the brief
     2. Ask the timeout question
     3. inspect a citation
     4. draft, then copy
     5. mark reviewed

**Do not:**
- fake data or streaming
- change backend behaviour
- add decorative gradients or glow
- use colour as the only signal
- hide the scores or the tool timeline behind clicks

## Sources

- https://www.intercom.com/blog/announcing-fin-ai-copilot
- https://intercom.com/support-for-agents/ai-copilot
- https://support.zendesk.com/hc/en-us/articles/9945148867866-About-auto-assist
- https://support.zendesk.com/hc/en-us/articles/7908817636378-About-agent-copilot
- https://help.plain.com/article/ai-similar-threads
- https://www.plain.com/changelog/visual-overhaul-thread-view
- https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026
- https://aiuxplayground.com/guides/how-to-design-ai-citations
- https://www.assistant-ui.com/elements/inline-citation
- https://arxiv.org/html/2512.12207v1

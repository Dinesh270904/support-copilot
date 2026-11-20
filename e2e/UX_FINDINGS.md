# UX and accessibility findings (final verification of the submission candidate)

Method: the running candidate (no API keys) was inspected at 1440, 1100, 1024, 820 and 390 px in dark and light, plus 200% zoom
and `prefers-reduced-motion`, across 15 views and states (start screen, filters, filtered-empty queue, ticket, long ticket, brief,
answered, insufficient evidence, no candidates, validation error, MCP error, API down, loading, draft, source drawer, palette,
shortcuts help): 174 screenshots, each with automatic geometry checks (sideways scroll, clipped text, overlapping controls that are
both on top, targets under 24 px that are not inline) and, at 1440 and 390 px, axe with the full WCAG 2.2 AA tag set including
target-size. Five screenshots were also looked at by eye (`api-down-390-dark`, `insufficient-1100-light`, `palette-390-dark`, and the answered and 390 px README screenshots); the other findings rest on the automatic checks and axe, not on visual review. Screenshots live under `/tmp` and are not committed.
A first inspection ran against a stale server for a different branch and was discarded; everything below is from the candidate.

Severity: **S1** broken or blocks the task. **S2** confusing, inaccessible or visually wrong. **S3** polish.
Counts: S1 = 0. S2 = 4 (all fixed, each with a regression test that fails before the fix). S3 = 9 (listed, not implemented).

## Fixed (S2), one commit and one regression test each

| ID | Screen | Issue | Evidence | Fix commit | Regression test |
|---|---|---|---|---|---|
| UX-01 | API down / database not initialized, 390 px | The status pill read "Assistant offline" at full width (131 px) and pushed the page 51 px sideways (`scrollWidth` 441 vs 390) | geometry check flagged `overflowX` in both themes; reproduced with `scrollWidth` 441 | `424392e` short "Offline" form on phones | `error-layout.spec.ts` (3 tests; 2 fail before) |
| UX-02 | Ticket with a draft open, any width | After a ticket is reviewed its "Mark reviewed" button is disabled, so the scrolling conversation pane had no focusable content: a keyboard user could not scroll it (axe `scrollable-region-focusable`, serious) | axe run on the draft state; `Tab` never reached the pane | `5a8155c` the pane is a labelled focusable region | `a11y-draft.spec.ts` (5 tests; all fail before) |
| UX-03 | Review confirm by keyboard (`r`, Enter) | The Confirm button disappears and the focus-return code looked for a button that no longer exists, so focus fell back to `<body>` (WCAG 2.4.3) | `keyboard-only.spec.ts` failed at the last step: "focus fell back to <body>" | `678e4a0` focus moves to the ticket title | `keyboard-only.spec.ts` |
| UX-04 | Answer card, citation markers | Hovering, focusing or clicking a marker logged 6 console errors: the preview (div, blockquote, p) was rendered inside the answer's `<p>` (invalid HTML) | the dead-control sweep flagged `console.error x6`; reproduced in isolation | `00e7f6d` the preview renders in a portal on `<body>`; the blur check accepts focus inside it | `console-clean.spec.ts` (2 tests; both fail before) |

Test defects fixed on the way (not user-facing): several e2e tests (the palette a11y scans, the palette count, the `open_high_checkout_count` case, and the keyboard specs) pressed a
shortcut the instant `goto()` returned and lost a ~120 ms race (shortcuts go live once the ticket list has loaded); `appReady()` now waits for the loaded queue (`b15340d`, `9efa179`).

## Suggestions, not implemented (S3 and ideas)

| ID | Screen | Observation | Evidence | Why not changed here |
|---|---|---|---|---|
| S3-01 | Phone, queue screen | No `main` landmark while the Queue tab is shown (axe `landmark-one-main`, best-practice; Lighthouse accessibility 0.98 instead of 1.00) | Lighthouse mobile run | Needs the queue pane to change element, which several role-based tests depend on; not a WCAG A/AA failure |
| S3-02 | Brief, similar, limitations and notes toggles | Link-style buttons are 16 px tall (33x16, 78x16, 148x16). Axe target-size (with its spacing exceptions) passes in every state | geometry check; axe wcag22aa clean | Enlarging the hit area is a restyle |
| S3-03 | API down, queue | View counts read "0" (Open 0, High priority 0, ...), which can be read as "no tickets" | screenshot `api-down-390-dark` | Copy and design change |
| S3-04 | Ticket, keyboard | `r` asks for confirmation, but the Mark reviewed button and the palette command mark immediately | `controls.spec.ts` "palette command ... Mark current ticket reviewed" | A deliberate guard for stray key presses; consistency is a design decision |
| S3-05 | Draft | A draft lives in the page only; reloading discards it. The UI says "Draft, not sent... copy it", but a new user may expect it to be kept | `cold-start.spec.ts` asserts the reload behaviour | New feature |
| S3-06 | Ticket and Copilot | Two solid primary buttons on one screen ("Mark reviewed" and "Ask") | screenshots | Restyle |
| S3-07 | Brief card | The first sentence repeats the ticket header's metadata | screenshots | Copy change |
| S3-08 | Palette on phones | The footer shows an "esc" hint and the shortcut hints, which a phone user cannot use | `palette-390-dark` | Polish |
| S3-09 | Start screen | The "Try these" block lists demo-oriented ticket descriptions | screenshot | Content decision |

## Cold-start comprehension (`cold-start.spec.ts`)

A first-time user with no stored state, no shortcut and only visible labels reaches a cited answer (KB-03#chunk-1, with its score and the
tool trace), edits a draft and copies it to the clipboard, and marks the ticket reviewed in **5 clicks**
(pick a ticket, click a suggested question, Draft with Copilot, Copy draft, Mark reviewed). Things a new user could miss:
the keyboard shortcuts are shown as small hints on buttons and in the shortcuts sheet only; a draft is not kept after a reload (S3-05).

## Performance (Lighthouse on `vite build` + `vite preview`, headless Chromium)

| Page | Desktop (perf / a11y / best-practices / SEO) | Mobile (perf / a11y / best-practices / SEO) |
|---|---|---|
| Empty page | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.2 s, TBT 0, CLS 0.028) | 0.99 / 0.98 / 1.00 / 1.00 (LCP 2.1 s, TBT 0, CLS 0) |
| Ticket page | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.5 s, CLS 0.017) | 0.99 / 1.00 / 1.00 / 1.00 (LCP 2.1 s) |
| Answered state (user flow, desktop) | navigation 1.00 / 1.00 / 1.00 / 1.00; interaction: performance 1.00, INP 40 ms, TBT 0, CLS 0.018; snapshot: accessibility 1.00, best-practices 1.00, SEO 1.00 | not run |

The one mobile accessibility deduction is S3-01. The snapshot's performance 0 is an artefact (snapshots have no performance audits).

## Other observations

- Database: `PRAGMA integrity_check` ok, 0 foreign-key violations, foreign keys enforced at runtime, no string-built SQL, and the query plans use
  the intended indexes (`ix_tickets_status_priority_category` serves the list query).
- With the database file renamed while the API runs, `/health` still reports `database: ok` (the API holds an open handle) while the MCP child
  is degraded; assistant calls return a safe 503. A restart reports "database not initialized".
- Lint: `ruff` is configured in `pyproject.toml` but not in the dev requirements and the repo has no CI; running it reports 30 style findings (one unused import in `tests/test_eval.py`).

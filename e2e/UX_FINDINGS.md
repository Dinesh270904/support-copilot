# UX and accessibility findings (final verification of the submission candidate)

Method: the running candidate (no API keys) was inspected at 1440, 1100, 1024, 820 and 390 px in dark and light, plus 200% zoom
and `prefers-reduced-motion`, across 15 views and states (start screen, filters, filtered-empty queue, ticket, long ticket, brief,
answered, insufficient evidence, no candidates, validation error, MCP error, API down, loading, draft, source drawer, palette,
shortcuts help): 174 screenshots, each with automatic geometry checks (sideways scroll, clipped text, overlapping controls that are
both on top, targets under 24 px that are not inline) and, at 1440 and 390 px, axe with the full WCAG 2.2 AA tag set including
target-size. Five screenshots were also looked at by eye (`api-down-390-dark`, `insufficient-1100-light`, `palette-390-dark`, and the answered and 390 px README screenshots); the other findings rest on the automatic checks and axe, not on visual review. Screenshots live under `/tmp` and are not committed.
A first inspection ran against a stale server for a different branch and was discarded; everything below is from the candidate.

Severity: **S1** broken or blocks the task. **S2** confusing, inaccessible or visually wrong. **S3** polish.
Counts after the final re-inspection: S1 = 0. S2 = 6 (all fixed, each with a regression test that failed before the fix: UX-01 to UX-04 in the first pass, UX-05 and UX-06 in the re-inspection). S3 = 15: four of the first nine fixed (S3-01, 02, 03, 05), S3-08 fixed for the palette only, and the rest left as suggestions (S3-04, 06, 07, 08 for the buttons, 09, and the six new ones S3-10 to S3-15).

## Re-inspection on the final tree (branch `final2`)

Run against the real app (no API keys, real API and MCP child) after the hardening changes: 6 viewport sizes (1440, 1100, 1024, 820, 390, and 720 px, which is a 1440 px window at 200% zoom) x 2 themes x 20 to 22 views and states = **250 records** (start screen, queue, filtered-empty, API-down queue showing "-", ticket, brief and similar cards collapsed and expanded, answered, insufficient evidence, no candidates, validation error, MCP error, loading, draft, draft restored after a reload, holding reply for the untrusted ticket, command palette, shortcuts sheet, review confirm, status popover, drawers, and the phone tab bar with its `main` landmark). Each record has automatic checks (sideways scroll, controls outside the viewport, painted overlaps of controls, clipped text without an ellipsis) and axe with the full WCAG 2.2 AA tag set plus best-practice. Eleven screenshots were also looked at by eye (390 API-down, 390 answered, 390 draft light, 390 MCP error, 720 answered, 820 queue drawer, 820 API-down, 1024 answered, 1100 palette light, and the earlier README screenshots). Screenshots live under `/tmp` and are not committed.

Result: no sideways scroll, no control outside the viewport, no clipped text and no serious or critical axe violation in any of the 250 records; exactly one visible `main` landmark in every record and on each of the three phone tabs; no animation running under `prefers-reduced-motion`; the 200% zoom size (720 px) reflows without sideways scroll. The only axe findings are moderate best-practice rules (S3-10, S3-11). Two real defects were found, both S2, and fixed:

| ID | Screen | Issue | Evidence | Fix commit | Regression test |
|---|---|---|---|---|---|
| UX-05 | API down or database not initialized, 768-1023 px and the phone's Ticket tab | The only error message and Retry live in the queue pane, which is a closed drawer (or another tab) there. The main pane showed a normal "Pick a ticket to start / from the queue on the left" with no sign of the failure beside a small "Assistant offline" pill | the 820 px record timed out waiting for an alert; screenshot `820x1000-dark-04-api-down-ERR` shows the healthy-looking start screen | `00c94eb` the start screen shows the error and Retry when the queue is not on screen (`0dd6779` extends the test to "database not initialized") | `errors.spec.ts` "API unreachable / Database not initialized at 820 px and 390 px: the main pane itself says so and offers Retry" (failed before the change) |
| UX-06 | Ticket pane with the Copilot drawer open, 768-1279 px | The drawer lies over the ticket pane, but Tab still reached the conversation region, "Mark reviewed" and "Draft with Copilot" while the drawer completely covered them, so focus was invisible (WCAG 2.2 SC 2.4.11 Focus Not Obscured, AA) | a Tab walk with an `elementFromPoint` check listed exactly those three controls at 1100, 1024 and 820 px | `a966baf` the ticket pane is inert while the drawer is open | `limitations.spec.ts` "<w> px: with the Copilot drawer open, Tab never lands on a control hidden under it" (failed at all three widths before the change) |

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
| S3-01 | Phone, queue screen | No `main` landmark while the Queue tab is shown (axe `landmark-one-main`, best-practice; Lighthouse accessibility 0.98 instead of 1.00) | Lighthouse mobile run | FIXED: each phone tab's visible pane is the `main` landmark (`limitations.spec.ts`). |
| S3-02 | Brief, similar, limitations and notes toggles | Link-style buttons are 16 px tall (33x16, 78x16, 148x16). Axe target-size (with its spacing exceptions) passes in every state | geometry check; axe wcag22aa clean | FIXED: link-style buttons get a 24px hit area (padding cancelled by negative margin). |
| S3-03 | API down, queue | View counts read "0" (Open 0, High priority 0, ...), which can be read as "no tickets" | screenshot `api-down-390-dark` | FIXED: counts read "–" (with a title) when the list could not load (`errors.spec.ts`). |
| S3-04 | Ticket, keyboard | `r` asks for confirmation, but the Mark reviewed button and the palette command mark immediately | `controls.spec.ts` "palette command ... Mark current ticket reviewed" | A deliberate guard for stray key presses; consistency is a design decision |
| S3-05 | Draft | A draft lives in the page only; reloading discards it. The UI says "Draft, not sent... copy it", but a new user may expect it to be kept | `cold-start.spec.ts` asserts the reload behaviour | FIXED: the draft and edits persist per ticket in `sessionStorage` (`limitations.spec.ts`, `cold-start.spec.ts`). |
| S3-06 | Ticket and Copilot | Two solid primary buttons on one screen ("Mark reviewed" and "Ask") | screenshots | Restyle |
| S3-07 | Brief card | The first sentence repeats the ticket header's metadata | screenshots | Copy change |
| S3-08 | Touch devices | FIXED for the command palette (its shortcut hints are hidden when `pointer: coarse`). NOT fixed for the buttons: "R" on Mark reviewed, "D" on Draft with Copilot and the Enter symbol on Ask are still shown on touch devices | `ux2` probe with a touch context: visible `<kbd>` on the Ticket and Copilot tabs | Polish: add the same class to those three buttons |
| S3-09 | Start screen | The "Try these" block lists demo-oriented ticket descriptions | screenshot | Content decision |
| S3-10 | Every screen | axe `page-has-heading-one` (moderate, best-practice): there is no `<h1>`; the app name is a `<span>` and the page title is an `<h2>` | 208 of 250 records | Heading levels were designed without an h1 |
| S3-11 | Shortcuts sheet, drawers, queue (rail) | Dialog and drawer titles use `<header>`, which counts as a second banner landmark: axe `landmark-no-duplicate-banner` and `landmark-unique` (moderate, best-practice) | 16 records each | Use a `div` or `role="presentation"` in `Drawer.tsx` and `ShortcutSheet.tsx` |
| S3-12 | 768-1279 px | The open Copilot drawer covers the ticket title and the Mark reviewed button until it is closed (by design: C or Esc closes it; after UX-06 the covered controls are inert) | screenshot `1024x768-dark-07-answered` | Design choice; a narrower drawer would show more |
| S3-13 | Answer card, 390 px | The status badge "Answered from 1 article · Checkout" wraps onto two lines inside its outline | screenshot `390x844-dark-07-answered` | Shorten the label or let the badge wrap without the outline |
| S3-14 | 200% zoom (720 x 450) and a phone with a draft open | The docked Ask box with its suggestion chips, or the composer, takes more than half of the viewport, leaving about two lines of content | screenshots `720x450-dark-07-answered`, `390x844-light-14-draft` | Hide the chips on short viewports |
| S3-15 | MCP error card | The status pill keeps saying "Ready" after a failed assistant call until the next health check | `390x844-dark-12-mcp-error` (simulated 503) | The pill follows `/health`, not individual runs |

## Cold-start comprehension (`cold-start.spec.ts`)

A first-time user with no stored state, no shortcut and only visible labels reaches a cited answer (KB-03#chunk-1, with its score and the
tool trace), edits a draft and copies it to the clipboard, and marks the ticket reviewed in **5 clicks**
(pick a ticket, click a suggested question, Draft with Copilot, Copy draft, Mark reviewed). Things a new user could miss:
the keyboard shortcuts are shown as small hints on buttons and in the shortcuts sheet only. A draft and its edits are kept for the tab session, so a reload restores them (`cold-start.spec.ts` reloads and checks it) and saving needs no click: **2 clicks** reach a cited answer, **3** reach a cited answer plus a saved draft, and 5 cover the whole flow including Copy and Mark reviewed.

## Performance (Lighthouse 13.6.0 on `vite build` + `vite preview`, headless Chrome for Testing)

Measured on the final tree, server: `vite preview` of the production build (`frontend/dist`: JS 393.80 kB, 113.44 kB gzip; CSS 59.19 kB, 11.71 kB gzip) on 127.0.0.1:4173, proxying `/api` to a seeded API on 127.0.0.1:8300. Two runs per cell (scores perf / a11y / best-practices / SEO).

| URL | Desktop run 1 | Desktop run 2 | Mobile run 1 | Mobile run 2 |
|---|---|---|---|---|
| `/` (empty page) | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.4 s, TBT 0, CLS 0) | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.4 s, CLS 0.028) | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.8 s) | 0.99 / 1.00 / 1.00 / 1.00 (LCP 2.1 s) |
| `/#/ticket/T-101` (ticket page) | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.5 s, CLS 0.017) | 1.00 / 1.00 / 1.00 / 1.00 (LCP 0.5 s, CLS 0.017) | 0.99 / 1.00 / 1.00 / 1.00 (LCP 2.1 s) | 0.99 / 1.00 / 1.00 / 1.00 (LCP 2.1 s) |

The only audit below 1.00 in any run is "Time to Interactive" on mobile (performance 0.99). Mobile accessibility is 1.00 on the empty page, which on a phone is the Queue screen: the earlier 0.98 (S3-01) is gone.

Answered state, Lighthouse user-flow API (navigate, then a timespan around typing a question and pressing Enter until the answer card is on screen, then a snapshot), three runs, same server:

| Form factor | Navigation | Interaction (timespan) | Snapshot after the answer |
|---|---|---|---|
| Desktop | 1.00 / 1.00 / 1.00 / 1.00 | performance 1.00; INP 130, 20 and 20 ms; TBT 0; CLS 0.015 | accessibility 1.00, best-practices 1.00, SEO 1.00 |
| Mobile | 1.00 / 1.00 / 1.00 / 1.00 | performance 1.00; INP 30, 30 and 40 ms; TBT 0; CLS 0 | accessibility 1.00, best-practices 1.00, SEO 1.00 |

The snapshot's performance 0.00 is an artefact (snapshots have no performance audits). INP varies between runs (the first desktop run was 130 ms); all values are under the 200 ms "good" threshold.

## Other observations

- Database: `PRAGMA integrity_check` ok, 0 foreign-key violations, foreign keys enforced at runtime, no string-built SQL, and the query plans use
  the intended indexes (`ix_tickets_status_priority_category` serves the list query).
- With the database file renamed while the API runs, `/health` still reports `database: ok` (the API holds an open handle) while the MCP child
  is degraded; assistant calls return a safe 503. A restart reports "database not initialized".
- Lint: `ruff` is pinned in the dev requirements and `make lint` passes with the bug-finding rules (pyflakes and bugbear); style rules are not enforced and the repo has no CI.

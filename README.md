# Support Copilot

A local, offline copilot for support agents. Pick a ticket, then summarize it, search internal guidance, find similar resolved tickets, count tickets, or draft a reply. Every answer is built from retrieved records, shows its sources and tool trace, and says plainly when the evidence is insufficient. **No LLM, no API keys, no network calls, and nothing is ever sent to a customer.**

```
React/TS (Vite) ──HTTP──▶ FastAPI ──MCP client (stdio)──▶ MCP server ──read-only──▶ SQLite
                           │  orchestrator: fixed tool plan per action              ├─ tickets, messages
                           │  deterministic response composer                       ├─ articles, chunks
                           └─ writes: mark reviewed, assistant run log ──▶ SQLite   └─ FTS5 ticket_search
```

## Quick start

Prerequisites: Python 3.11, 3.12 or 3.13 (the backend suite and the tuning evaluation were run on all three on macOS by Claude Code), Node 20+ (tested on Node 22).

**Use the project virtualenv, `backend/.venv`.** A bare `python3` is often a different interpreter without the
dependencies (it was 3.14 on the author's machine). The Makefile and `scripts/dev.sh` use `backend/.venv/bin/python`
automatically when it exists, and so does `backend/mcp.json`.

```bash
python3.11 -m venv backend/.venv                    # any of 3.11-3.13
backend/.venv/bin/pip install -r backend/requirements-dev.txt
(cd frontend && npm install)                         # or: make install
make dev         # seeds SQLite if missing, starts API on :8000 (which launches the MCP server), UI on :5173
```

Open http://localhost:5173. API docs are at http://127.0.0.1:8000/docs, and health is at `/health`.

Without `make`:

```bash
cd backend && .venv/bin/python -m app.seed                                # migrate + seed + verify index build
.venv/bin/python -m uvicorn app.api.main:app --port 8000      # starts the MCP stdio server as a subprocess
# in a second terminal
cd frontend && npm install && npm run dev
```

After dependencies are installed, everything runs with networking disabled. Re-seed at any time with `make setup` or `RESEED=1 make dev`. Reseeding resets tickets and articles to the data pack and keeps the assistant run log.

## Sample actions

| Ticket | Action | Input | Expected |
|---|---|---|---|
| T-104 | Search knowledge | "lost authenticator after replacing phone; backup code and enroll a new device" | KB-03 quoted with `KB-03#chunk-1` citation |
| T-104 | Similar tickets | (empty: uses ticket text) | T-105 and its fix |
| T-101 | Search knowledge | "PAYMENT_TIMEOUT with a pending authorization; should the customer retry checkout?" | KB-01 steps in order, including "do not ask … another payment" |
| T-101 | Search knowledge, scope Checkout | "What does PAYMENT_TIMEOUT mean and how do I resolve it?" | KB-01, retrieved by the **error-code rule** (cosine is only 0.10), with the pending-payment prohibition kept |
| any | Search knowledge | "How do I delete my account?" | **Insufficient evidence**: one shared word ("account") is not enough |
| T-101 | Search knowledge, scope Billing | "Does the product reimburse a bank decline fee?" | **Insufficient evidence**: KB-06 says it does not cover this |
| any | Search knowledge, scope Integrations | "Configure scheduled SFTP delivery…" | **Insufficient evidence**, no citations |
| — | Count tickets | "How many open high-priority tickets mention checkout failures?" | 1 (T-101), parsed filters shown |
| T-112 | Summarize | — | SFTP identified; injected message flagged, not followed |
| T-101 | Draft reply | — | Editable draft labelled "Draft, not sent": one customer step from KB-01; the "do not ask … another payment" caution and a KB-02 sentence appear under "Notes for the agent" |

All ten cases in `backend/data/seed/expected_cases.json` run as tests (`tests/test_expected_cases.py`).

## How a question flows

1. **UI** posts `{action, ticket_id?, query?, category?}` to `POST /api/assistant/run`.
2. **FastAPI** validates the request with Pydantic: the action enum, ID patterns, a 500-character query limit, and per-action requirements. The orchestrator (`app/api/assistant.py`) chooses a **fixed tool plan** from the action. For example, `search_knowledge` maps to `get_ticket` (if a ticket is given) then `search_knowledge`. Content never changes the plan.
3. **MCP client** (`app/api/mcp_gateway.py`) sends `tools/call` over a long-lived stdio session to `python -m app.mcp_server`.
4. **MCP server** (`app/mcp_server.py`, official `mcp` SDK `MCPServer`) validates typed arguments and queries SQLite through a read-only handle.
5. **RAG retrieval** (`app/rag/index.py`) uses TF-IDF and cosine similarity over chunks (words are stemmed first), then applies the category filter, the threshold, the term-coverage gate and top-k. An exact error-code match bypasses the threshold and gate. It returns chunk IDs, excerpts, scores and per-sentence scores as `structured_content`.
6. **Composer** (`app/composer/knowledge.py`) quotes supporting sentences verbatim with `[chunk-id]` tags, or returns `insufficient_evidence`.
7. **Response** contains the answer, citations (with scores), retrieval metadata, the tool trace and limitations. Run metadata (run ID, tools, method, status, duration, source IDs, query length only) is stored in `assistant_runs` and logged to stderr.

## Local RAG pipeline

- **Chunking** (`app/rag/chunking.py`): whole sentences are packed greedily into chunks of at most 45 words, with no overlap. IDs are stable (`KB-03#chunk-1`). Chunks are stored in SQLite with article ID, title and category. The 7 articles produce 14 chunks.
- **Vectorization**: scikit-learn's analyzer (lower-case, English stop words, 1-2-grams) followed by a small suffix normaliser (`app/rag/stemming.py`) applied to every word, with `sublinear_tf=True`. The normaliser is part of the analyzer, so chunks, sentences and queries are stemmed identically. It conflates "devices"/"device", "fees"/"fee" and "exporting"/"exports"/"export". The stems are index keys only: quotes are always the original text, and `matched_terms` are mapped back to the first word in the chunk's own text that produced each stem ("code", not "cod"). Each chunk is indexed as `title + tags + text`, so article-level terms such as "MFA" help rank every chunk of that article. The cited excerpt is the raw chunk text only.
- **Index build**: the index is built in memory from SQLite whenever the MCP server starts (under 20 ms; 8 ms measured at audit). `python -m app.seed --check` rebuilds it and prints statistics. Nothing is downloaded.
- **Scoring**: the query goes through the same vectorizer, and chunks are scored by cosine similarity. A category scope removes other chunks *before* the threshold and top-k are applied.
- **Three acceptance rules**, all configurable through environment variables (`SUPPORT_COPILOT_RAG_*`):
  1. `min_score = 0.15` cosine.
  2. **Term coverage**: a chunk must contain at least 2 distinct query terms, or more than half of them (`min_term_coverage = 0.6`). The fraction only matters when exactly one term matched, and then it passes only a one-term query. At 0.5, "How do I delete my account?" (1 of its 2 terms matching KB-03) slipped through; any value above 0.5 behaves identically here, so 0.6 reads as "more than half".
  3. **Error-code identifiers**: an UPPER_SNAKE token in the query (for example `PAYMENT_TIMEOUT`) that appears verbatim, as a whole token, in a chunk's text makes that chunk evidence on its own, even below the score floor. A code is near-unique, so an exact match is stronger evidence than any cosine: "What does PAYMENT_TIMEOUT mean and how do I resolve it?" scores only 0.10 against the article written for that error. The hit reports `matched_identifiers`. An unknown code (`ERR_FOO_BAR`) still gives insufficient evidence.

  Why two text gates: "office wifi password" scores 0.22 against KB-05 because of the single word "password", so a cosine cutoff alone cannot separate it from true matches (0.22-0.50).

### Evaluation (`python -m app.eval`)

Offline, no model, builds the corpus from the data pack. Metrics per article: precision@1, recall@3, MRR, and the false-positive rate (FPR) on negatives that should be insufficient evidence. Compared: the shipped TF-IDF, FTS5 bm25 over the same chunks (>= 2 matched terms), and a hybrid that returns an article only if both agree.

- **Tuning set** `backend/data/eval/tune.json` (39 queries: 28 positive, 11 negative). Every decision above was made on this set.
- **Holdout set** `backend/data/eval/holdout.json` (16 queries: 12 positive, 4 negative), written before any retrieval change and **never used for tuning**. `python -m app.eval --holdout` is the only way to read it. It was evaluated at baseline and at the end of the build; later reads were for verification only.

| Set | Retriever | P@1 / R@3 / MRR baseline | P@1 / R@3 / MRR final | FPR baseline | FPR final |
|---|---|---|---|---|---|
| tune (39) | TF-IDF (shipped) | 0.786 | **0.893** | 0.091 | **0.000** |
| tune (39) | FTS5 bm25 | 0.893 | 0.893 | 0.091 | 0.091 |
| tune (39) | hybrid (agree) | 0.786 | **0.893** | 0.000 | 0.000 |
| holdout (16) | TF-IDF (shipped) | 0.750 | **0.833** | 0.000 | 0.000 |
| holdout (16) | FTS5 bm25 | 0.833 | 0.833 | 0.250 | 0.250 |
| holdout (16) | hybrid (agree) | 0.750 | **0.833** | 0.000 | 0.000 |

Baseline is the original code (score floor 0.15, coverage 0.5, no identifier rule, no stemming); the baseline columns are an ad hoc run on that earlier code, and the baseline code and run script are not included in this repo. P@1, R@3 and MRR are equal in every row because the corpus has only 7 articles, so the question is whether the right article is retrieved at all, not its rank. Holdout by kind, shipped TF-IDF (baseline to final):

| Kind | n | P@1 baseline | P@1 final |
|---|---|---|---|
| direct | 4 | 1.000 | 1.000 |
| error_code | 1 | 1.000 | 1.000 |
| inflection | 2 | 1.000 | 1.000 |
| short | 1 | 1.000 | 1.000 |
| **paraphrase** | 4 | **0.250** | **0.500** |
| negative (FPR) | 4 | 0.000 | 0.000 |

Threshold sweep on the tuning set, with the coverage gate on: P@1 is 0.893 and FPR is 0.000 for every `min_score` from 0.05 to 0.175, then 0.857 at 0.20, 0.786 at 0.25 and 0.679 at 0.30. So 0.15 is not a sharp optimum; it sits on a plateau with a margin before the cliff, and the gates, not the cosine cutoff, do the separating work. The 0.6 coverage value was chosen after seeing one tuning query ("delete my account"); the holdout negatives stayed at 0 false positives. These are small sets, so treat the numbers as evidence of direction, not precision.

Paraphrase is the remaining gap, as expected for lexical retrieval: the two holdout misses ("pay button spun forever and now there's a hold on the customer's card", "new phone, 2FA app is gone, can't log in") share almost no words with their articles.
- **Composition rules** (deterministic, no generation):
  1. If nothing passes retrieval, the result is `insufficient_evidence` with no citations. The answer says why: an empty category, too few shared terms, or a best score below the threshold.
  2. If the best-supported sentence is a *coverage disclaimer* ("does not define …"), the result is `insufficient_evidence`, and the disclaiming chunk is cited as `coverage_gap`. This handles the bank-decline-fee case, where similarity is high precisely because KB-06 names the topic it excludes.
  3. Otherwise, up to 3 supporting sentences are quoted verbatim, in documented order.
  4. **Guardrails survive**: prohibition sentences ("do not …", "never …") from cited articles that share a query term are always included. When the question named the article's error code, all of that article's prohibitions are eligible, because an identifier is one token and shares no word with "If the payment is pending, do not ask …".
- **What TF-IDF misses compared with embeddings**: synonyms and paraphrase ("can't log in" vs "locked out", "reimburse" vs "refund") and intent. The light stemmer handles plain inflections only. It is strong on exact codes such as `PAYMENT_TIMEOUT`, and it is transparent: `matched_terms` and `matched_identifiers` explain every hit.

## Similar tickets and counts

- `search_resolved_tickets` uses SQLite **FTS5** (`porter unicode61`) over title, description, conversation and resolution, ranked by `bm25` with column weights. User text is reduced to quoted alphanumeric terms joined with `OR`, so FTS operators such as `NEAR`, `*` or column filters cannot be injected.
- **Relevance floor**: a resolved ticket is listed only if it shares at least 2 distinct query terms (stemmed), or all of them when the query has fewer. A query term found in more than half of the indexed tickets ("customer" is in 75%) carries no signal and does not count. Before this, "customer asks about weather in Paris and email" returned three tickets because of generic words. Each hit lists its `matched_terms`. The 50% cutoff was measured on 12 tickets; a larger history would call for re-checking it.
- `count_tickets` takes typed filters. The API can read status, priority and a known category from a natural-language question, and explicit filters override parsed ones. The response lists which filters were applied.

## MCP server

| Tools (all read-only, typed input and output schemas) | Resources |
|---|---|
| `get_ticket(ticket_id)` | `support://tickets/{ticket_id}` (template) |
| `search_knowledge(query, category=None, top_k=3)` | `support://knowledge/{article_id}` (template) |
| `search_resolved_tickets(query, category=None, exclude_ticket_id=None, limit=3)` | `support://knowledge` (article index) |
| `count_tickets(filters)` | `support://index/status` (index statistics and thresholds) |

**How SQLite access is constrained**:
- The server opens the database with `mode=ro` and `PRAGMA query_only=ON`.
- Tools accept only typed, pattern-validated parameters. There is no SQL passthrough.
- All SQL lives in `app/repository.py` and uses SQLAlchemy expressions or bound parameters.
- The only write (`PATCH /api/tickets/{id}/reviewed`) lives in FastAPI and is idempotent: the first review time is kept.

Logs go to stderr, and stdout is reserved for MCP frames.

**Inspect it.** The commands below use the project venv interpreter, `backend/.venv/bin/python`, explicitly. A bare `python3` is a different interpreter and fails with `No module named 'mcp'`. The database must exist first: on a fresh clone run `.venv/bin/python -m app.seed` (or `make setup`) in `backend/`, otherwise the server exits with "Database not found" and the Inspector reports a connection timeout.

```bash
cd backend
npx @modelcontextprotocol/inspector .venv/bin/python -m app.mcp_server                       # web UI
npx @modelcontextprotocol/inspector --cli .venv/bin/python -m app.mcp_server --method tools/list
npx @modelcontextprotocol/inspector --cli .venv/bin/python -m app.mcp_server \
    --method tools/call --tool-name search_knowledge --tool-arg query="backup code authenticator"
npx @modelcontextprotocol/inspector --cli .venv/bin/python -m app.mcp_server --method resources/read --uri support://tickets/T-104
npx @modelcontextprotocol/inspector --cli --config mcp.json --server support-copilot --method tools/list   # via the config file
.venv/bin/python scripts/mcp_check.py      # same checks with the official Python SDK client, no Node needed
```

In the web UI (written against Inspector v2.13; `npx` fetches the newest release, so labels may differ slightly): open the printed URL (it includes a token), then:

1. **Connect**: flip the toggle on the `python` server card. It shows "Connecting…" and then "Connected, MCP 2025-11-25". The Tools, Prompts and Resources tabs only appear after it connects.
2. **Tools**: open the **Tools** tab. There is no separate "List tools" button; `tools/list` runs automatically on connect and the four tools are listed (`TOOLS/LIST` is already in the log). Each tool page shows READ-ONLY and IDEMPOTENT badges.
3. **Call `search_knowledge`**: select "Search knowledge articles (TF-IDF)", type `backup code authenticator` into the required **Query** field, and click **Execute Tool**. Expect `KB-03#chunk-1`, score about 0.46, and `matched_terms` of `["authenticator", "backup", "code"]` (original words from the chunk; the stemmer is an internal index detail).
4. **Read a ticket**: open the **Resources** tab. The ticket is under **Templates (2)**, not the plain URIs (those are the article index and the index status). Select "Support ticket", type `T-104` into `ticket_id` (the URI preview shows `support://tickets/T-104`), then click **Read Resource**.

The right-hand **Protocol** panel logs every JSON-RPC message with timing (`TOOLS/CALL`, `RESOURCES/READ`).

Client config: `backend/mcp.json` (`command` is `.venv/bin/python`, resolved against `cwd`, so create the venv first).

**API resilience**: the MCP server is started once, when the API starts.
- If it fails to start, the API still serves tickets, `/health` reports `degraded`, and assistant calls return a safe `503 assistant_unavailable` while retrying the connection.
- `/health` pings the MCP server (2 s limit), so it reports `degraded` as soon as the child process is dead, not only after a request fails.
- If the connection drops, including a `SIGKILL` of the child while a request is in flight, the call is retried once on a fresh session. This is safe because every tool is read-only and idempotent. A drop is recognised by the SDK's typed `CONNECTION_CLOSED` JSON-RPC code, not by message text; any other protocol error is a tool error and is not retried.
- A tool call that exceeds the timeout (15 s) returns **`504 gateway_timeout`**, recycles the connection, and is *not* retried (a hung server would make the user wait twice as long). Tool errors return `502 tool_error`.
- Every `SUPPORT_COPILOT_*` environment variable is forwarded to the MCP child; the API's resolved settings win for the database path, log level and RAG values, so the two processes can never disagree about the database.
- Stack traces stay in the server logs. The browser gets `{error: {code, message, request_id}}`.

## API

| Route | Notes |
|---|---|
| `GET /health` | Database status, a live MCP ping, tool list, index statistics |
| `GET /api/meta` | Statuses, priorities, categories, actions (drives UI filters) |
| `GET /api/tickets?status&priority&category&reviewed&limit&offset` | Bounded at 100. Invalid enum or unknown category returns 422 |
| `GET /api/tickets/{id}` | Ticket with timeline. Malformed ID returns 422, unknown returns 404 |
| `PATCH /api/tickets/{id}/reviewed` | Idempotent review mark |
| `POST /api/assistant/run` | Unsupported action, extra fields, oversized query or missing requirements return 422; MCP down 503; MCP timeout 504 |
| `GET /api/assistant/runs` | Recent run metadata (audit view) |

## Frontend

React 19 + TypeScript + Vite with plain CSS custom properties: no UI framework. The one icon dependency is
[`@phosphor-icons/react`](https://github.com/phosphor-icons/react) (MIT). It ships the icons as bundled SVG components, so nothing is fetched
at runtime and the UI still works offline. Phosphor was chosen over a hand-drawn set for consistent, professionally drawn geometry
and multiple weights (regular, fill for active states, duotone for the brand mark). Only `src/components/Icons.tsx` imports it.
Cost, measured with `vite build`: the JS bundle is 391.9 KB (112.86 KB gzip) now; the earlier 298.5 KB (91.3 KB gzip) figure, an ad hoc build measurement from before the icon change that cannot be reproduced from this repo, implies about +21.6 KB gzip,
because each icon carries all six weights; CSS is 59.1 KB (11.67 KB gzip). Lighthouse on the production build (measured in the final verification, headless Chromium, `vite preview`): desktop empty page and ticket page score 1.00 in performance, accessibility, best practices and SEO; mobile scores performance 0.99 and best practices and SEO 1.00, accessibility 1.00 on the ticket page and 0.98 on the phone's queue screen (axe `landmark-one-main`: no main landmark while only the queue is shown, a known gap), and the answered state (user flow) scores 1.00 with an INP of 40 ms. The design source is
`docs/UI_HANDOFF.md` (a longer addendum was also supplied during the build; it is not stored in this repo). Five screenshots are committed below; the full set
(about 2.4 MB) was kept out of the repo to stay within its size budget.

- **Layout**: queue, ticket and Copilot panes. The queue has five views (Open, High priority, Needs review, Resolved, All) with counts
  computed from the loaded list, filters, and a sort. The ticket pane has the conversation (instruction-like messages are flagged and left
  unfollowed) and a reply composer that always says "Draft, not sent". The Copilot pane has the brief, similar resolved tickets and an Ask box.
- **The answer card** is the point of the UI: the answer as prose, each sentence tied to a numbered source; hovering or focusing a marker previews
  the exact excerpt with the quoted sentence highlighted; a score meter shows each similarity against the minimum; the tool calls that produced
  the answer are shown by default and the raw trace is one click away. Insufficient evidence leads with a plain sentence and keeps the backend's
  specific reason beneath it.
- **Auto-runs**: opening a ticket starts two assistant runs in parallel (`summarize_ticket` and `search_resolved_tickets`), so each ticket opened
  adds **2 entries to `GET /api/assistant/runs`**. Leaving a ticket aborts its in-flight runs; reopening one already loaded does not re-run them.
- **URL state**: `#/ticket/T-101?view=high` (no router dependency). Reload and back/forward restore the ticket and view; an unknown ID shows
  "Ticket not found".
- **Keyboard**: Cmd/Ctrl+K opens a command palette (tickets, actions, views, `count ...` inline); `j`/`k` move through the queue, `/` focuses
  Ask, `s` refreshes the brief, `d` drafts, `r` marks reviewed, `t` toggles the theme, `1`-`5` switch view, `?` lists everything. Single-letter
  keys are ignored while typing.
- **Responsive**: three panes from 1280px; the Copilot becomes a drawer from 1279px down (toggle `c`, opens when an answer arrives); the queue
  becomes an icon rail below 1024px; below 768px there is one pane with a bottom tab bar.
- **Themes and contrast**: dark by default, light on request, remembered per browser. Text contrast was measured, not assumed; where a literal
  token failed WCAG AA the text colour was adjusted (see the comment at the top of `frontend/src/styles/tokens.css`), never a tint's alpha.

### Screenshots

| | |
|---|---|
| ![Answered, with a citation preview](docs/screenshots/readme-1-answered-citation-preview.jpg)<br>Answered: each sentence carries a numbered source; the preview shows the quoted chunk and its score. | ![Not enough evidence](docs/screenshots/readme-2-not-enough-evidence.jpg)<br>Not enough evidence (bank decline fee): the closest article says the topic is out of scope, so Copilot declines to answer. |
| ![Untrusted customer message](docs/screenshots/readme-3-untrusted-message.jpg)<br>T-112: an instruction-like customer message is flagged and not followed. | ![Holding-reply draft](docs/screenshots/readme-4-draft-holding.jpg)<br>Holding-reply draft: marked "not sent", with a warning that no guidance was found. |

![Phone layout at 390 px](docs/screenshots/readme-5-mobile-390.jpg)

## Data model

The schema is created by Alembic migration `0001_initial`:
- `tickets`, with CHECK constraints on status and priority, a composite index `(status, priority, category)`, and indexes on category and updated_at
- `ticket_messages`
- `articles`
- `article_chunks`
- `assistant_runs`
- the FTS5 virtual table `ticket_search`

The seed (`app/seed.py`) validates the JSON pack with Pydantic, which rejects duplicate IDs and malformed timestamps, then reloads everything in one transaction.

## Tests

```bash
make test            # backend: 155 pytest tests (+1 expected failure); frontend: 101 Vitest tests (12 files)
```

| Requirement | Tests |
|---|---|
| 1. Known query retrieves the expected chunk ID | `test_retrieval.py` |
| 2. Evidence is quoted with citations; low score gives insufficient evidence with no citation | `test_composer.py` |
| 3. MCP lists tools and resources; tool call and resource read over real stdio | `test_mcp_server.py` |
| 4. FastAPI calls MCP over stdio end to end | `test_api.py::test_end_to_end_action_goes_through_mcp_stdio` |
| 5. Filters and review persist; unknown IDs and unsupported actions rejected; MCP outage gives 503 | `test_api.py` |
| 6. Injected article or ticket text cannot change the plan or run SQL | `test_safety.py` (seeds a malicious article KB-90) |
| Data pack expected cases | `test_expected_cases.py` |
| Error-code rule, stemmer, coverage gate, guardrails, drafts | `test_retrieval.py`, `test_stemming.py`, `test_api.py` |
| Similar-ticket relevance floor | `test_similar_tickets.py` |
| MCP reliability: real `SIGKILL` (idle and mid-request), 504 mapping, env passthrough, typed errors, honest `/health` | `test_gateway_reliability.py` |
| Eval harness: label validity, metric arithmetic, holdout not read by default | `test_eval.py` |
| UI: answer card and citations (markers, preview, drawer, meter, timeline), insufficient / no-results / error states, queue views and routing, composer, Copilot cards and Ask box, keyboard and palette, responsive layouts, theme | `frontend/src/__tests__/*.test.ts(x)` |

## End-to-end tests

Verification records kept in `e2e/`: `REQUIREMENTS_MATRIX.md` (the assignment line by line, each with evidence), `CONTROLS.md` (every interactive control, how it is reached and which test asserts its effect) and `UX_FINDINGS.md` (layout, accessibility, performance and the defects found and fixed).

`e2e/` holds a Playwright suite that drives the real app in a real browser: the real FastAPI process, the real MCP stdio subprocess, a real
SQLite file and real keyboard and mouse input. There are no mocks and no stubbed network. It uses its own ports (API 8100, UI 5180, plus
8101 for a missing database and 5181 and 5182 for the "database not initialized" and "API down" states) and a temporary database that is
seeded fresh before every run, so it never touches `backend/data/support.db`.

```bash
cd e2e && npm install && npx playwright install chromium   # one-time dev download (about 100 MB); the app itself does not need it
make e2e                                                   # or: cd e2e && npm run e2e   (add -- --headed to watch it)
```

After the one-time browser download the tests run offline. The suite is 144 tests in 21 files and takes about 5 minutes (5.1-5.3 measured, one worker). It covers the queue
and filters, ticket detail, the automatic brief and similar cards, answers and citations (including a sentence-by-sentence grounding check),
drafts and the real clipboard, review and idempotency, the full keyboard path with real key presses, MCP and database failure states (it kills
the real MCP child), responsive layouts at 1440, 1100, 820 and 390, axe accessibility scans in both themes, and every case in
`expected_cases.json` through the UI. A test that records a known, not-yet-fixed finding should use `test.fail()`, so the run turns red if it starts
passing, and be named `BUG-n`; there are none at v1.2.

## Known limitations

- Retrieval is lexical: no synonyms or paraphrase. Paraphrase is the weakest kind in the evaluation (holdout P@1 0.500). A larger corpus would need a re-tuned threshold and probably BM25 or hybrid ranking.
- A reply draft and the brief's checklist live in the page only; reloading discards them (nothing is saved or sent).
- On a phone the Queue screen has no `main` landmark (the ticket pane, the only `<main>`, is hidden there); the accessibility audit reports it as a best-practice gap (Lighthouse 0.98).
- Single-word queries can fall below the similarity floor. Bare 'timeout' scored 0.098 against KB-04. The category scope narrows ambiguity, and real questions with more terms retrieve correctly. This is recorded as a strict expected-failure test (`test_ambiguous_single_term_query_surfaces_both_articles_and_exports_scope`).
- Ambiguous short queries can span categories ("timeout" is a tag of both KB-01 and KB-04). The ticket's category scope resolves them, and the UI defaults to it; unscoped, the answer may come from only one article.
- The evaluation sets are small (39 tuning, 16 holdout queries) and were labelled by hand; the corpus is 7 articles and 12 tickets. The coverage value (0.6) and the similar-ticket 50% cutoff were chosen on this data.
- The "information still needed" lists in summaries are fixed per-category checklists with keyword detection, not inference.
- Drafts quote internal wording verbatim ("first check the order…"); the agent is told to rephrase before sending. Draft steps come from the top-ranked article only; agent-facing prohibitions and sentences from other articles are listed under "Notes for the agent", not in the customer text.
- FTS rows are rebuilt by the seed. Tickets are immutable in this prototype apart from `reviewed_at`.
- There is no authentication or role model. It is a single local agent.
- The API accepts request bodies of any size and rejects oversized fields only after parsing them (a 2 MB body gets a 422, not a 413); there is no size-limit middleware.
- `assistant_runs` is never pruned, and opening a ticket writes two rows (the automatic brief and similar-tickets runs). Fine for a local demo; a real deployment would add retention.
- SQLite uses the default rollback journal, not WAL. An ad hoc 5-second stress run with one writer and four readers produced no lock errors, so WAL was not added (the script and its counts are not included in this repo).
- A few routes are `async def` yet make short synchronous database calls (`/health`, the category check before an assistant run); they block the event loop for microseconds, which does not matter at this scale.
- The route handler attaches the run record to the raised exception (`exc.run_record`) so failed runs are still logged; it works but is a shortcut a larger codebase would replace with a result type.
- The TF-IDF index is built once when the MCP server starts. Changing articles needs a re-seed and a restart of the API (which restarts the MCP server).
- Instruction-like text detection is a regex that *flags* content for the agent. Safety comes from the structural guarantees: the fixed tool plan, typed tools and read-only SQLite access.

**Not built** (deliberately, to keep the prototype small and checkable):
- No streaming: answers come back in one response, with no SSE or WebSocket.
- No authentication or role checks (see above); `GET /api/assistant/runs` is open to any local caller.
- No audit view in the UI: run history is available only through that API endpoint.
- No model adapter or LLM call of any kind, so there is nothing to configure and no API key.
- No Docker image or compose file: the app runs from a Python virtualenv and Node, as in the quick start.

**With a local LLM or a larger corpus**, I would keep this pipeline as the retrieval and citation layer and the fallback:
- Add embeddings (hybrid with BM25) for recall.
- Have a local model rephrase only the retrieved sentences, then check its output: every sentence must map to a cited chunk.
- Keep the deterministic composer for insufficient-evidence decisions.

## AI tools used

Almost all of the code, tests and documentation were written by Claude Code, working from specifications and prompts I drafted together with Claude (chat). I set the scope, reviewed each report, and approved or rejected each change. I did not write the retrieval, composer or UI code by hand. Every claim about test results in this README was produced by running the commands shown; output logs are not stored in the repo. The tuning and holdout query sets were written with AI assistance and the holdout set was evaluated at baseline and at the end of the build; later reads were for verification only.

### What was built and checked with AI assistance

Each item can be checked in the repo (code, tests or scripts); the process history beyond `git log` is not documented.

- The backend suite and the tuning evaluation pass on Python 3.11, 3.12 and 3.13 with identical metrics. `python3` on the development machine is 3.14 and does not have the dependencies installed, which is why the docs insist on `backend/.venv`.
- All ten cases in `backend/data/seed/expected_cases.json` run as tests (`tests/test_expected_cases.py`) and again through the UI (`e2e/tests/expected-cases.spec.ts`).
- The MCP server is exercised by an official Python SDK client (`backend/scripts/mcp_check.py`) and by the Inspector CLI, including `--config mcp.json`. The Inspector web UI steps below were written from a browser-automation walkthrough of v2.13; I have not run them myself, and `npx` now fetches a newer release.
- Reconnect behaviour is tested against a real child process: `SIGKILL` while idle and during an in-flight call (`tests/test_gateway_reliability.py`).
- The offline evaluation harness (`app/eval.py`) and the tuning and holdout sets (`backend/data/eval/`).
- The error-code rule, the stemmer, the coverage gate value, the guardrail fix, the similar-ticket floor, the 504 mapping, environment passthrough, the `/health` ping and the draft split, each with tests.
- The UI follows the written handoff specification in `docs/UI_HANDOFF.md`; a longer addendum used during the build is not stored in this repo.
- A final verification pass (an offline run with the network denied, an every-control test run, an accessibility, layout and performance inspection) is recorded in `e2e/REQUIREMENTS_MATRIX.md`, `e2e/CONTROLS.md` and `e2e/UX_FINDINGS.md`; it found and fixed the four defects listed in the last.

### Mistakes caught along the way

- An early prototype stemmer turned "devices" into "devic" but left "device" alone, so the two never matched. A test for exactly that pair now exists (`tests/test_stemming.py`).
- A threshold sweep in the evaluation harness silently used a stale default for the coverage gate, so its 0.15 row disagreed with the main table. It was fixed and a regression test added (`tests/test_eval.py`).
- A "weak match" test query contained the word "customer", which is in 75% of tickets, so a count-only relevance floor was not enough and a document-frequency rule was added.
- A first set of process-kill tests used the shared session fixture and broke other tests. They now use an isolated app.

### What this section does not claim

- Retrieval numbers come from small, hand-labelled sets (39 tuning queries, 16 holdout queries) over a 7-article, 12-ticket corpus.
- The original implementation's history is not reconstructed here.

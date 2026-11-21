# Requirements matrix (task_assignment_generic.md)

Every row quotes the assignment (line number = line in `task_assignment_generic.md`) and gives a verdict with evidence.
Evidence was re-produced on 2026-11-21 on the final tree (branch `final2`: v1.2.3 plus the hardening and the fixes from the final audit) from fresh clones under `/tmp`, with `env -i PATH HOME` (no API keys). Where a check from the earlier audit was not repeated, the row says so.
`PASS` = demonstrated by a command, a named test or a measurement. `PARTIAL` = met in part. `N-A` = optional or not applicable.

## A. Negative requirements (proved by running something, not by reading)

| Line | Requirement | Verdict | Evidence |
|---|---|---|---|
| 7 | No OpenAI/Anthropic/hosted LLM API | PASS | `pip list` has 52 packages; grep of the names openai, anthropic, torch, tensorflow, transformers, onnx, llama, ollama, gguf, sentence, huggingface, vllm, cuda, nvidia, jax = 0 matches. `git grep -Ei "openai|anthropic|ollama|llama|transformers|torch|onnx|gguf|huggingface|api_key"` over backend, frontend, e2e, scripts = no output |
| 7, 150 | No API keys; no API-key environment variables | PASS | The app reads only `SUPPORT_COPILOT_DB, _CORS_ORIGINS, _LOG_LEVEL, _MAX_BODY_BYTES, _MAX_RUN_HISTORY, _MCP_*_TIMEOUT, _RAG_*, _SEED_DIR` (grep of `os.environ`/`_env_*`). Everything below ran under `env -i PATH HOME` |
| 7, 64 | No GPU, CPU-only, no large model download | PASS | Installed packages: scikit-learn 1.9.1, scipy, numpy; site-packages 296 MB in total (largest: scipy 99 MB, sklearn 49 MB, numpy 36 MB); no CUDA/torch package |
| 64 | No local model runtime, no cloud dependency | PASS | Same package list; no runtime or SDK for any model host |
| 7, 150 | Runs with network access disabled after install | PASS | `sandbox-exec '(deny network*)'`: first a sanity check, `socket.create_connection(('1.1.1.1',443))` -> `PermissionError: Operation not permitted`; then `pytest` -> `160 passed, 1 xfailed` and `python -m app.eval` unchanged (tune 0.893 / FPR 0.000), both run inside the sandbox on the final tree. The full Playwright suite under a loopback-only profile ran on v1.2.2 and was NOT repeated in this pass (the final e2e runs were normal runs) |
| 89 | No arbitrary SQL as an MCP tool | PASS | MCP client lists exactly 4 tools: `get_ticket(ticket_id)`, `search_knowledge(query, category, top_k)`, `search_resolved_tickets(query, category, exclude_ticket_id, limit)`, `count_tickets(filters)`. Calling `run_sql`, `execute_sql`, `query`, `mark_reviewed`, `update_ticket` -> `isError: Unknown tool`. At the SQL layer `file:...?mode=ro` rejects `UPDATE` with "attempt to write a readonly database" |
| 6, 32 | Nothing is sent to a customer | PASS | The only routes are the 6 listed in section D; none contacts a customer. e2e `draft.spec.ts` "nothing in the app can send anything" passes; the draft is labelled "Draft · not sent" |
| 150 | Avoid logging full ticket text | PASS | Sent a distinctive query (`zebraquasar-9921`) plus T-101/T-104/T-112 summarize, draft and search requests, then re-scanned the full API log at DEBUG level, which includes the MCP child's stderr (3,935 lines, 651 KB, 1,173 of them from the MCP server), after sending a distinctive query (`zebraquasar7731xyz`) through search, similar-tickets and count and summarize/draft/similar for T-101, T-104, T-106 and T-112: the query occurs 0 times; 0 of 80 ticket/article/resolution text fragments occur. Test: `test_api.py::test_run_log_and_db_row_hold_query_length_but_never_query_or_ticket_text` |
| 91 | stdout reserved for MCP protocol | PASS | `test_mcp_stdio_session.py::test_full_stdio_session_has_only_json_rpc_on_stdout_and_logs_on_stderr` |
| 36, 45 | No real customer data, credentials, secrets | PASS | Pack files are byte-identical to `customer_support_data.zip` (`cmp`); `git grep` for key-like strings, passwords, `/Users/`, usernames, emails over tracked files = no output |

## B. Data requirements (lines 36-49)

| Line | Requirement | Verdict | Evidence (database after `python -m app.seed`) |
|---|---|---|---|
| 38-40 | At least 12 tickets across 3+ categories, mix of open/resolved and low/medium/high | PASS | 12 tickets; 6 categories (account_access 2, billing 2, checkout 3, exports 2, integrations 1, notifications 2); status open 7 / resolved 5; priority high 4 / medium 4 / low 4 |
| 41 | 6 short articles with stable IDs, titles, tags, practical steps | PASS | 7 articles (KB-01..KB-07), 14 chunks stored in `article_chunks` |
| 42 | 4 resolved tickets for similarity search | PASS | 5 resolved tickets, all with `resolution_summary` |
| 43 | Deliberate cases: one with no matching article, one with insufficient evidence | PASS | `expected_cases.json`: `no_sftp_guidance` (no relevant results, `insufficient_evidence`) and `unknown_bank_decline_fee` (`insufficient_evidence`); both pass over real HTTP and through the UI |
| 36 | Repeatable seed/setup | PASS | `python -m app.seed` three times -> identical fingerprint `8702928d1790a187`, counts `[12, 24, 7, 14, 12]` |
| 47, 49 | Suggested fields | PASS | Tickets: id, title, description, category, priority, status, product_area, created_at, updated_at, reviewed_at, resolution_summary, plus messages in `ticket_messages`. Articles: id, title, category, tags, applies_to, body, updated_at |

## C. Stack (lines 53-64)

| Line | Requirement | Verdict | Evidence |
|---|---|---|---|
| 55 | React, TypeScript, Vite | PASS | react ^19.3.1, typescript ~5.9.3, vite ^8.3.8; `tsc -b` exit 0; `vite build` OK |
| 56 | Python 3.11+, FastAPI, Pydantic, API docs | PASS | `requires-python >=3.11`; pytest run on the final tree with Python 3.11 (the project venv), 3.12 and 3.13, each in a throwaway virtualenv: `160 passed, 1 xfailed` on all three, `python -m app.eval` tune row 0.893 / FPR 0.000 and `ruff` clean on 3.12 and 3.13; `GET /docs` 200, `GET /openapi.json` 200 |
| 57 | SQLite, SQLAlchemy, Alembic, one migration, useful indexes | PASS | Migration `0001_initial`; `alembic upgrade head` -> `downgrade base` (leaves only `alembic_version`) -> `upgrade head` round trip on an empty DB; 7 indexes; `EXPLAIN QUERY PLAN` shows the composite status/priority/category index serving the list query |
| 58 | Official `mcp` package, stdio, separate server, client in FastAPI | PASS | `mcp==2.3.0` (`mcp.server.mcpserver.MCPServer`, `stdio_client`, `ClientSession`); server is `python -m app.mcp_server`; handshake protocol 2025-11-25 |
| 59 | scikit-learn TfidfVectorizer + cosine, chunks and metadata in SQLite | PASS | `app/rag/index.py` imports `TfidfVectorizer`, `cosine_similarity`; `article_chunks(chunk_id, article_id, position, title, category, text, word_count)` |
| 60 | SQLite FTS5 for similar resolved tickets | PASS | `ticket_search` is `CREATE VIRTUAL TABLE ... USING fts5(...)`; `expected_cases` `similar_mfa_recovery` -> T-105 |
| 61 | Small deterministic composer, no invented facts | PASS | Each of the five actions sent three times over real HTTP -> three identical response hashes apart from run id and durations (draft reply `a011fb32ae6d`, search `200e061bb327`, summary `23e07b707945`, count `8142e089f6fa`, similar `13247afd04c0`); `test_grounding.py::test_answer_is_quoted_from_cited_chunks_or_cites_nothing` |
| 62 | pytest, plus one frontend test (Vitest) covering a visible UI behaviour | PASS | pytest 160 + 1 xfail; Vitest 103 tests in 12 files (the suite also has 157 Playwright tests) |

## D. RAG, MCP and API requirements

| Line | Requirement | Verdict | Evidence |
|---|---|---|---|
| 72 | Chunks stored with article ID, title, category, chunk ID | PASS | Column list above; `KB-03#chunk-1` style ids |
| 73 | TF-IDF built locally, rebuilt at startup | PASS | Built in memory when the MCP server starts (log line `TF-IDF index built ... ms=8`); README documents it |
| 74 | Top-k by cosine similarity | PASS | `test_retrieval.py::test_known_query_retrieves_expected_chunk_with_stable_id`, `::test_scores_are_sorted_and_respect_top_k` |
| 75 | Documented minimum similarity threshold; insufficient evidence when nothing clears it | PASS | `min_score = 0.15` (`config.py:32`), plus a term-coverage gate (`0.6`) and an error-code rule, documented in README with the reasons and the sweep. Tests: `test_unrelated_query_rejected_by_threshold_or_coverage_gate`, `test_low_scoring_query_returns_insufficient_evidence_without_citations`, `test_one_of_two_query_terms_is_not_evidence` |
| 76 | Source IDs, titles, excerpts in the answer; no added facts | PASS | Metadata of the sample request: `retrieval {method: tfidf_cosine, top_k: 3, min_score: 0.15, min_term_coverage: 0.6, candidates_considered: 14, best_score: 0.2375, ...}`, `tool_calls ["get_ticket","search_knowledge"]`, citations with title, excerpt, score |
| 70 | Stages visible in the answer metadata | PASS | `retrieval`, `tool_calls`, `tool_trace`, `citations`, `limitations` keys present; UI shows them (e2e "an answered question shows markers, sources with scores, matched terms and the tool timeline") |
| 82-87 | Typed, documented, read-only tools | PASS | All 4 tools: `readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False`, each with an output schema |
| 89 | Read-only resource templates for tickets and articles | PASS | Templates `support://tickets/{ticket_id}`, `support://knowledge/{article_id}`; resources `support://knowledge`, `support://index/status`; `read support://knowledge/KB-03` returns the article. Test: `test_mcp_server.py::test_lists_resource_templates_and_resources`, `::test_resource_reads` |
| 89 | Write (mark reviewed) on a separate validated FastAPI route | PASS | `PATCH /api/tickets/{id}/reviewed` in FastAPI; `mark_reviewed` is not an MCP tool (see A) |
| 82 | Same SQLite database as FastAPI | PASS | Both processes read `SUPPORT_COPILOT_DB`; the API's resolved path is forwarded to the child (README, `test_gateway_reliability.py` env passthrough test) |
| 91 | FastAPI uses the official MCP client; does not bypass MCP | PASS | `mcp_gateway.py` `stdio_client` + `ClientSession`; assistant service holds no DB session; `test_api.py::test_end_to_end_action_goes_through_mcp_stdio` |
| 91 | Verify with the MCP Inspector or equivalent | PASS | `npx @modelcontextprotocol/inspector --cli` ran `tools/list`, `tools/call search_knowledge` (KB-03#chunk-1, 0.4589), `resources/read support://tickets/T-104`, and the `--config mcp.json` form from a clean clone (after seeding); the Python SDK client (`scripts/mcp_check.py`, this audit's `mcp_audit.py`) ran the same |
| 121 | `GET /health` readiness | PASS | 200 `{"status":"ok","database":"ok","mcp":{"connected":true,"tools":[...]}}`; degraded within one request after SIGKILL of the child |
| 122 | `GET /api/tickets` bounded, filters | PASS | `limit` 1-100, `offset` 0-10000; filters status/priority/category; `limit=0` and `101` -> 422; `limit=100` -> 200 |
| 123 | `GET /api/tickets/{id}` with timeline | PASS | 200 with messages; unknown `T-999` -> 404 `ticket_not_found`; malformed `abc` and SQL-looking ids -> 422 |
| 124 | `POST /api/assistant/run` returns result, tool trace, citations, limitations | PASS | 10/10 expected cases over real HTTP (FastAPI -> MCP stdio -> SQLite); response keys: action, answer, answer_state, citations, count, draft, duration_ms, limitations, retrieval, run_id, sections, ticket_id, tool_calls, tool_trace, warnings |
| 125 | `PATCH /api/tickets/{id}/reviewed` is the only required write | PASS | 200; second call idempotent (first timestamp kept); unknown id 404 |
| 127 | Reject unknown ticket IDs, unsupported actions, invalid filters, oversized queries with clear 4xx | PASS | Unknown ticket 404; unsupported action 422; extra field 422; invalid status/priority/category 422; query of exactly 500 characters 200, 501 characters 422; invalid JSON 422; a request body larger than 16 KB (16,384 bytes) is now refused before it is parsed: 16,384 bytes passes (200), 16,385 bytes -> 413 `payload_too_large`, a 2 MB body -> 413, any chunked body -> 411 `length_required`, all in the standard `{error:{code,message,request_id}}` shape with CORS headers; a valid-shape 16 KB body with a 16,000-character query is still 422 from the 500-character rule |
| 127 | Safe errors; stack traces in logs only | PASS | Every error body is `{error:{code,message,request_id}}`; SIGSTOP of the MCP child -> 504 `gateway_timeout` after 18 s; DB renamed + child killed -> 503 `assistant_unavailable`; recovery to 200 after the file returned; `test_api.py::test_tool_error_log_has_the_code_but_never_the_error_text` |

## E. Required automated tests (lines 141-148)

| # | Requirement | Verdict | Passing tests |
|---|---|---|---|
| 1 | Known query retrieves the expected chunk and stable ID | PASS | `test_retrieval.py::test_known_query_retrieves_expected_chunk_with_stable_id`, `::test_chunking_keeps_whole_sentences_and_stable_ids` |
| 2 | Evidence in the composed answer with citations; low score -> insufficient evidence, no fabricated citation | PASS | `test_composer.py::test_answer_quotes_retrieved_sentences_verbatim_with_citations`, `::test_low_scoring_query_returns_insufficient_evidence_without_citations`, `::test_out_of_category_query_returns_insufficient_evidence` |
| 3 | MCP server lists tools/resources; one tool call and one resource read | PASS | `test_mcp_server.py::test_lists_typed_read_only_tools`, `::test_lists_resource_templates_and_resources`, `::test_search_knowledge_tool_returns_chunks_ids_excerpts_scores`, `::test_resource_reads` |
| 4 | FastAPI calls MCP over stdio end to end | PASS | `test_api.py::test_end_to_end_action_goes_through_mcp_stdio` |
| 5 | Filters and mark-reviewed persist; unknown IDs and unsupported actions rejected | PASS | `test_api.py::test_ticket_filters`, `::test_invalid_filters_rejected`, `::test_mark_reviewed_persists_and_is_idempotent`, `::test_unknown_and_malformed_ids_rejected`, `::test_unsupported_action_and_bad_requests_rejected` |
| 6 | Instruction-like article text cannot change the fixed flow or run arbitrary SQL/code | PASS | `test_safety.py::test_malicious_article_is_retrieved_as_data_only`, `::test_every_action_uses_only_its_fixed_plan`, `::test_sql_like_query_text_does_not_execute`, `::test_fts_query_sanitiser_neutralises_operators` |
| 150 | Run metadata recorded (run id, tools, retrieval method, success/failure, duration) | PASS | `assistant_runs` columns: run_id, created_at, action, ticket_id, status, answer_state, tool_calls, retrieval_method, source_ids, query_chars, duration_ms, error_code |

## F. Frontend (lines 25-32, 129-137)

Every spec named below passed in each of the three final full runs from a fresh clone (157 tests, 0 failed, 0 retries, 5.8 minutes each).

| Line | Requirement | Verdict | Evidence (Playwright, real browser) |
|---|---|---|---|
| 27, 132 | Queue with status, priority, category filters | PASS | `queue.spec.ts` (views, filters match `GET /api/tickets`), `controls.spec.ts` (every filter checkbox, Clear all, chips) |
| 28 | Ticket description, timeline, metadata | PASS | `ticket.spec.ts` "T-101 shows description, ordered conversation, metadata and review status" |
| 29, 133 | Actions: summary, article retrieval, similar tickets, counts, draft | PASS | `copilot-auto.spec.ts` (summary and similar), `answer.spec.ts` (retrieval), `keyboard.spec.ts` + `controls.spec.ts` (count), `draft.spec.ts` (draft) |
| 32, 134 | Answer, sources, tool trace; clickable citations/expandable excerpts with score | PASS | `answer.spec.ts` (markers, preview on hover/focus/click, drawer, score meters), `controls.spec.ts` (View source, raw trace drawer) |
| 135 | Edit a draft, copy it, clear "not sent" label | PASS | `draft.spec.ts` (Draft · not sent, edit, live count, Reset, real clipboard) |
| 136 | Loading, no-evidence, validation-error, MCP/API-error, empty-result states | PASS | `states.spec.ts` (loading skeleton, not enough evidence, no candidates, validation, empty view), `errors.spec.ts` (MCP killed, 503 card, DB not initialized, API down) |
| 137 | Review status visible; deterministic review action | PASS | `review.spec.ts` (Reviewed with time, persists, confirm and cancel, idempotent) |
| 131 | Responsive layout | PASS | `responsive.spec.ts` at 1440, 1100, 1024, 820, 390 |

## G. Deliverables (lines 152-164) and review session (166-175)

| Line | Requirement | Verdict | Evidence |
|---|---|---|---|
| 156 | Frontend and backend source | PASS | `frontend/` (67 files under `src/`), `backend/app/` (26 Python modules), counted with `git ls-files` |
| 157 | Synthetic data and repeatable seed | PASS | `backend/data/seed/*.json`, `python -m app.seed`, idempotent (section B) |
| 158 | Models and migrations | PASS | `app/models.py`, `alembic/versions/0001_initial_schema.py` (round trip proven) |
| 159 | Automated tests and how to run them | PASS | README "Tests" and "End-to-end tests"; `make test`, `make e2e` |
| 160 | README: prerequisites, startup, sample actions, architecture/data flow, index build, MCP setup, limitations | PASS | README sections: Quick start (prerequisites), Sample actions, How a question flows, Local RAG pipeline (index build), MCP server, Known limitations; quick start run verbatim from a clean clone |
| 161 | MCP Inspector configuration or command | PASS | README "Inspect it" commands and `backend/mcp.json`; all ran (section D) |
| 162 | Note naming AI tools and what was reviewed, changed, or tested | PASS | README "AI tools used" names Claude Code and Claude (chat), says what was reviewed (each agent report with its test results; every change approved or rejected by the author), what was changed by hand (the author states that no retrieval, composer or UI code was written by hand) and what was tested (the three suites, the MCP Inspector CLI, the evaluation harness). The wording is the author's own; whether every statement in it is true is for the author to confirm: NEEDS-ME |
| 164 | Default quick start: seeds SQLite, builds the index, starts MCP through FastAPI, launches the frontend | PASS | `python3.11 -m venv`, `pip install`, `npm install`, `make dev` run verbatim: seeded 12/7/14, API `ok` with MCP connected, UI 200 |
| 170 | Trace one question through every layer | PASS | `REVIEW_FACTS.md` data flow with file:line references |
| 171 | Inspector or another client lists tools/resources and calls a read operation | PASS | Section D |
| 172 | Explain chunking, TF-IDF, top-k, threshold, citations, limits vs embeddings | PASS | README "Local RAG pipeline" and "Evaluation"; weak spot stated (paraphrase 0.500 on the holdout) |
| 173 | How SQLite access is constrained; how MCP and end-to-end paths were tested | PASS | `mode=ro` + `PRAGMA query_only=ON`; parameterised SQL only (no string-built SQL found); tests in section E |
| 174 | Small change during the session | PASS | Rehearsed again on a throwaway clone of the final tree: (1) coverage 0.6 -> 0.5 in the default of `TfidfIndex.search` (`rag/index.py:125`) fails exactly one test, `test_one_of_two_query_terms_is_not_evidence` (159 passed), and the tuning FPR becomes 0.091 (`python -m app.eval` with `SUPPORT_COPILOT_RAG_MIN_TERM_COVERAGE=0.5` shows the same 0.091); changing only `config.py` fails no test, because the unit tests use the index default; (2) adding an article changes the chunk count, which two tests hard-code (`test_api.py:21` and `test_retrieval.py:36`, both `== 14`); (3) `count_tickets` already filters on status, priority and category (`schemas.py:19-23`), so a `reviewed` filter is the natural small change |

## H. Behaviour added after the first audit, checked against the requirements above (final tree, real curl against the real API)

| Line | Requirement checked | Verdict | Evidence |
|---|---|---|---|
| 127 | The 16 KB request-body limit (413, and 411 for chunked) keeps every error a clear, safe 4xx and leaves normal use alone | PASS | `curl`: Content-Length 16,383 and 16,384 -> 200; 16,385, 20,000 and 2,000,000 -> 413; chunked small and large -> 411; each body `{error:{code,message,request_id}}`, `X-Request-ID` echoed, no stack trace; `PATCH` with an oversized body -> 413 (the guard is global); a normal `GET` and `POST` right afterwards -> 200; CORS preflight for the UI origin -> 200 and the 413/411 carry `access-control-allow-origin` (found and fixed in this audit: `test_size_guard_errors_carry_the_same_cors_headers_as_every_other_error`). Tests: `test_oversized_request_body_is_refused_with_413_before_parsing`, `test_chunked_request_body_is_refused_with_411`, e2e `limitations.spec.ts` |
| 89, 91 | The MCP server stays read-only and allow-listed; only FastAPI writes | PASS | MCP client over stdio lists exactly 4 tools (all `readOnlyHint` and `idempotentHint` true, each with an output schema), 2 resource templates and 2 resources; `run_sql`, `execute_sql`, `query`, `mark_reviewed`, `update_ticket` -> `Unknown tool`; the read-only SQLite handle rejects both `UPDATE` and `INSERT` ("attempt to write a readonly database"). The run-log pruning is a `DELETE` on `assistant_runs` made by FastAPI, never by MCP. Inspector CLI: `tools/list`, `tools/call search_knowledge` (`KB-03#chunk-1` 0.4589, matched terms authenticator/backup/code), `resources/read support://tickets/T-104`, `--config mcp.json` |
| 150 | Run metadata is recorded, and the log does not grow without bound | PASS | 1,100 requests, 8 in parallel, while a second client polled `GET /api/assistant/runs?limit=200` 150 times: all 1,100 answered 200 and all 150 polls 200; no `database is locked` or traceback in the API log; the table holds exactly 1,000 rows, and they are exactly the 1,000 most recently inserted (100 oldest pruned); five further runs all survived and the count stayed 1,000; `limit=200` -> 200, `limit=201` -> 422. Same-second bursts keep the newest rows (found and fixed in this audit: `test_run_history_prune_never_deletes_the_newest_rows_in_a_same_second_burst`), plus `test_run_history_keeps_only_the_newest_rows` |
| 127 | MCP and database failures surface as safe service errors and the app recovers | PASS | `SIGKILL` of the MCP child between requests: `/health` `degraded` within a second, the next request 200 on a new child; `SIGKILL` during 8 parallel requests: all 8 returned 200 (one retry on a fresh session); `SIGSTOP`: 504 `gateway_timeout` after 18 s, then 200; database file renamed plus child killed: 503 `assistant_unavailable`, 200 again after the file returned; API started with no database: `/health` `degraded`, every data route 503 `database_not_initialized` and the API did not create the file |
| 150 | Idempotent, repeatable setup; migrations | PASS | `python -m app.seed` three times -> identical fingerprint `8702928d1790a187`, counts `[12, 24, 7, 14, 12]`; `alembic upgrade head` -> `downgrade base` (only `alembic_version` left) -> `upgrade head` on an empty database; `PRAGMA integrity_check` ok, 0 foreign-key violations |
| 5, 6 | Nothing is sent to a customer; the agent keeps control of the draft | PASS | A reply draft and its edits are now also kept in the browser tab's `sessionStorage` (per ticket; a new tab session starts clean; nothing goes to the server): `limitations.spec.ts` (reload keeps it, a new browser context does not), `cold-start.spec.ts` (reload, still labelled "Draft · not sent"), Vitest `TicketPane` (remount, and storage blocked) |
| 131-137 | Responsive layout and the required states | PASS | Re-inspected at 1440, 1100, 1024, 820, 390 and 720 px (200% zoom) in both themes across 22 views and states, 250 records: no sideways scroll, no control outside the viewport, no clipped text, no serious or critical axe violation; two S2 defects found and fixed (UX-05, UX-06 in `UX_FINDINGS.md`) |

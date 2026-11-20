# Prefer the project venv (backend/.venv) when it exists; override with `make PYTHON=...`.
PYTHON ?= $(if $(wildcard backend/.venv/bin/python),$(CURDIR)/backend/.venv/bin/python,python3)

.PHONY: install setup dev api ui test test-backend test-frontend lint typecheck mcp-inspect e2e clean

install:            ## Install backend + frontend dependencies
	cd backend && $(PYTHON) -m pip install -r requirements-dev.txt
	cd frontend && npm install

setup:              ## Run migrations, seed SQLite, print index stats (repeatable)
	cd backend && $(PYTHON) -m app.seed

dev:                ## Seed if needed, start API (+MCP server) and UI
	./scripts/dev.sh

api:
	cd backend && $(PYTHON) -m uvicorn app.api.main:app --reload --port 8000

ui:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && $(PYTHON) -m pytest

test-frontend:
	cd frontend && npx vitest run

lint:               ## Bug-finding lint (ruff: pyflakes + bugbear) for the backend
	cd backend && $(PYTHON) -m ruff check .

typecheck:
	cd frontend && npx tsc -b

mcp-inspect:        ## Open the MCP Inspector against the stdio server
	cd backend && npx @modelcontextprotocol/inspector $(PYTHON) -m app.mcp_server

clean:
	rm -f backend/data/support.db

e2e:                ## Real end-to-end tests (Playwright): real API, MCP subprocess, SQLite and browser
	cd e2e && npm run e2e

import { defineConfig } from "@playwright/test";
import path from "node:path";
import { DB, MISSING_DB, PY, ROOT, UI } from "./env";

const backend = path.join(ROOT, "backend");
const frontend = path.join(ROOT, "frontend");
const corsOrigins = "http://127.0.0.1:5180,http://127.0.0.1:5181,http://127.0.0.1:5182";

const vite = (port: number, target: string, url: string) => ({
  command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
  cwd: frontend,
  env: { VITE_API_TARGET: target },
  url,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: "ignore" as const,
  stderr: "ignore" as const,
});

export default defineConfig({
  testDir: "./tests",
  // One shared API and database: files run in order, one test at a time, so mutating tests cannot interfere.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: UI,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // Fresh seed into a temp file, then the real API (which starts the real MCP stdio subprocess).
      command: `sh -c "rm -f '${DB}' && '${PY}' -m app.seed --db '${DB}' > /dev/null 2>&1 && exec '${PY}' -m uvicorn app.api.main:app --host 127.0.0.1 --port 8100"`,
      cwd: backend,
      env: { SUPPORT_COPILOT_DB: DB, SUPPORT_COPILOT_CORS_ORIGINS: corsOrigins },
      url: "http://127.0.0.1:8100/health",
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 90_000,
    },
    {
      // An API whose database does not exist: the "database not initialized" state.
      command: `sh -c "rm -f '${MISSING_DB}' && exec '${PY}' -m uvicorn app.api.main:app --host 127.0.0.1 --port 8101"`,
      cwd: backend,
      env: { SUPPORT_COPILOT_DB: MISSING_DB, SUPPORT_COPILOT_CORS_ORIGINS: corsOrigins },
      url: "http://127.0.0.1:8101/health",
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 60_000,
    },
    vite(5180, "http://127.0.0.1:8100", UI),
    vite(5181, "http://127.0.0.1:8101", "http://127.0.0.1:5181"),
    vite(5182, "http://127.0.0.1:8199", "http://127.0.0.1:5182"), // nothing listens on 8199: "API down"
  ],
});

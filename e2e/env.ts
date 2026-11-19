import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");
export const PY = fs.existsSync(path.join(ROOT, "backend/.venv/bin/python")) ? path.join(ROOT, "backend/.venv/bin/python") : "python3";
/** Isolated database: seeded fresh by the webServer command, never the dev database. */
export const DB = path.join(os.tmpdir(), "support-copilot-e2e.db");
export const MISSING_DB = path.join(os.tmpdir(), "support-copilot-e2e-missing.db");
export const API = "http://127.0.0.1:8100";
export const UI = "http://127.0.0.1:5180";
export const UI_NO_DB = "http://127.0.0.1:5181"; // proxied to the API that has no database
export const UI_NO_API = "http://127.0.0.1:5182"; // proxied to a closed port

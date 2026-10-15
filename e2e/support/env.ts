import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The e2e environment: the site under test and the harness admin.
 *
 * - `E2E_BASE_URL` — the dev server to test (default http://e2e.localhost:4321). Not `VITE_URL`: the e2e run
 *   may target another dev server than the API suite (e.g. a worktree's on its own port). The host is
 *   `e2e.localhost`, not `localhost`: cookies ignore the port, so a `session_id` set on localhost:<any port>
 *   would replace the admin session of whoever else is signed in on localhost in the same browser.
 *   `*.localhost` resolves to the loopback in Chromium and Bun; the origin check compares against the
 *   request's own host, so it works unchanged.
 * - `TEST_EMAIL` / `TEST_PASSWORD` — the harness admin (a sysadmin) from tests/.env.test, the same one the
 *   API suite uses. It only ever acts through the API (invites, roles, deletions); the browser always signs
 *   in as a throwaway `@example.com` admin.
 */
const ENV_FILE = path.resolve(import.meta.dirname, "../../tests/.env.test");

/** Loads tests/.env.test into `process.env` without overriding what the shell already set. */
function loadTestEnv() {
	if (!existsSync(ENV_FILE)) return;
	for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match || line.trimStart().startsWith("#")) continue;
		const [, key, raw] = match;
		if (process.env[key] !== undefined) continue;
		process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
	}
}
loadTestEnv();

export const BASE_URL = (process.env.E2E_BASE_URL || "http://e2e.localhost:4321").replace(/\/+$/, "");

export function harnessCredentials() {
	const { TEST_EMAIL, TEST_PASSWORD } = process.env;
	if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error("TEST_EMAIL and TEST_PASSWORD must be set (tests/.env.test)");
	return { email: TEST_EMAIL, password: TEST_PASSWORD };
}

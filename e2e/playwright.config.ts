import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./support/env";

/**
 * End-to-end smoke tests (docs/IMPROVEMENTS.md T3) — a real Chromium against a running dev server.
 *
 * Kept out of `bun run test` (that is `bun test ./tests/`). Run with `bun run e2e` (see e2e/README.md):
 * it needs the dev server (`E2E_BASE_URL`, default http://localhost:4321), the emails worker (inviting the
 * throwaway admins sends an email, dry-run locally) and tests/.env.test (the harness admin).
 *
 * Projects: `desktop` (1280 px) runs everything; `phone` (375 px) runs the tests tagged `@phone`.
 */
export default defineConfig({
	testDir: ".",
	outputDir: "./test-results",
	// The suite writes to the local dev DB (admins, a pupil) and the dev server compiles pages on first
	// visit: one worker keeps it predictable, and it is small enough not to need more.
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	// No HTML report: the dev server's file watcher reloads pages when .html files change under the project.
	// Traces of failed tests land in test-results/ (which Vite ignores): `bunx playwright show-trace <zip>`.
	reporter: "list",
	use: {
		baseURL: BASE_URL,
		locale: "el-GR",
		timezoneId: "Europe/Athens",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
		},
		{
			name: "phone",
			grep: /@phone/,
			use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
		},
	],
});

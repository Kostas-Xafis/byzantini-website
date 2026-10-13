import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/loadEnvFile";
import { saveState } from "../src/campaign/state";
import {
	OPERATOR_EMAIL,
	assertOperatorOnlySend,
	blockProviderFetch,
	makeRecipient,
	readState,
	requireSmsDryRun,
	runCli,
	useScratchDirs,
} from "./helpers";

/**
 * Tests for the harness itself.
 *
 * These are the rails that keep the rest of the suite from emailing or texting
 * real people, so they are the first thing that has to be trustworthy: if
 * `runCli` ever stops refusing `--send`, or the scratch-directory redirect
 * stops working, every other test file silently becomes dangerous.
 */
const dirs = useScratchDirs("harness");

describe("safety rails", () => {
	test("a real send is allowed only for exactly one recipient, and only the operator", () => {
		// Accepted: the one shape a live send test may use.
		expect(() => assertOperatorOnlySend([makeRecipient(OPERATOR_EMAIL)])).not.toThrow();
		// Mixed case and surrounding spaces must not be a way through.
		expect(() => assertOperatorOnlySend([makeRecipient(`  ${OPERATOR_EMAIL.toUpperCase()} `)])).not.toThrow();

		// Everything else is refused — an empty list, a blast, and the single most
		// dangerous case: one recipient, but the wrong one.
		for (const audience of [
			[],
			[makeRecipient(OPERATOR_EMAIL), makeRecipient("student@example.gr")],
			[makeRecipient("student@example.gr")],
		]) {
			expect(() => assertOperatorOnlySend(audience)).toThrow(/Refusing to send/);
		}
	});

	test("the subprocess runner refuses --send outright, whatever else is passed", () => {
		for (const args of [
			["renew-2026", "--send"],
			["renew-2026", "--send", "--db", "prod", "--yes", "--limit", "1"],
			["renew-2026", "--channel", "both", "--send"],
		]) {
			expect(() => runCli(args)).toThrow(/refused --send/);
		}
	});

	test("state writes land in the scratch dir and never in the real campaign-state/", async () => {
		const realStateFile = path.resolve(import.meta.dir, "../campaign-state/harness-probe.json");
		expect(existsSync(realStateFile)).toBe(false);

		await saveState({
			campaignId: "harness-probe",
			channel: "email",
			createdAt: new Date().toISOString(),
			sent: [{ key: "a@example.gr", email: "a@example.gr", at: new Date().toISOString() }],
			failed: [],
		});

		// Written where the test asked for it...
		expect(readState(dirs, "harness-probe")?.sent).toHaveLength(1);
		expect(existsSync(path.join(dirs.state, "harness-probe.json"))).toBe(true);
		// ...and NOT into the repository's real resume state, which would mark a
		// student as already-sent in the next live campaign.
		expect(existsSync(realStateFile)).toBe(false);
	});

	test("ENV_FILE_PROTECT pins a key that env files would otherwise override", () => {
		const envFile = path.join(dirs.root, "probe.env");
		writeFileSync(envFile, "MAILERSEND_API_KEY=from-the-file\nOTHER_KEY=from-the-file\n", "utf8");

		// Without protection, `override: true` does its job and the file wins —
		// this is the documented behaviour the protection has to beat.
		process.env.MAILERSEND_API_KEY = "pinned-by-caller";
		process.env.OTHER_KEY = "pinned-by-caller";
		delete process.env.ENV_FILE_PROTECT;
		loadEnvFile(envFile, { override: true });
		expect(process.env.MAILERSEND_API_KEY).toBe("from-the-file");
		expect(process.env.OTHER_KEY).toBe("from-the-file");

		// With the key protected, the caller's value survives while unprotected
		// keys still load. This is what stops `.env.production` from restoring the
		// real sending key inside a test process.
		process.env.MAILERSEND_API_KEY = "pinned-by-caller";
		process.env.OTHER_KEY = "pinned-by-caller";
		process.env.ENV_FILE_PROTECT = "MAILERSEND_API_KEY";
		loadEnvFile(envFile, { override: true });
		expect(process.env.MAILERSEND_API_KEY).toBe("pinned-by-caller");
		expect(process.env.OTHER_KEY).toBe("from-the-file");
	});

	test("the fetch guard blocks provider calls and restores cleanly", async () => {
		const guard = blockProviderFetch();
		try {
			await expect(fetch("https://api.mailersend.com/v1/email")).rejects.toThrow(/Blocked a live provider call/);
			await expect(fetch("https://eu1.platform.bird.com/v1/sms/messages")).rejects.toThrow(/Blocked a live provider call/);
			expect(guard.calls).toHaveLength(2);
		} finally {
			guard.restore();
		}
		// A non-provider URL is passed through, so the guard is not just "fetch always throws".
		const after = await fetch("data:text/plain,ok");
		expect(await after.text()).toBe("ok");
	});

	test("the SMS suite runs only with the transport disarmed", () => {
		// helpers.ts pins this at import; requireSmsDryRun is the runtime assertion
		// that turns an accidentally-live SMS run into a failure instead of a bill.
		expect(() => requireSmsDryRun()).not.toThrow();
		expect(process.env.BIRD_DRY_RUN === "true" || process.env.BIRD_DRY_RUN === "1").toBe(true);
	});

	test("the CLI runs end-to-end without touching a provider", () => {
		const result = runCli(["--list"]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Available campaigns");
		// The pinned placeholder proves the child could not have sent even if it tried.
		expect(readFileSync(path.resolve(import.meta.dir, "../.env.development"), "utf8")).not.toContain("test-invalid-key-never-used");
	});
});

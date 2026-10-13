import { describe, expect, test } from "bun:test";
import path from "node:path";
import { collectRecipients, runCampaign } from "../src/campaign/runner";
import { loadEnvFile } from "../src/loadEnvFile";
import { OPERATOR_EMAIL, assertOperatorOnlySend, makeCampaign, makeRecipient, readState, useScratchDirs } from "./helpers";

/**
 * The one test that sends a real email, and the only place in the suite allowed
 * to unlock the real MailerSend key.
 *
 * Why it exists: the campaign send loop's state, resume and cap behaviour can be
 * proven with a stubbed transport (campaign-send.test.ts does exactly that), but
 * nothing else proves the REAL path end to end — the template read, the
 * placeholder substitution, the provider handoff. So this covers the actual
 * `--send` path once, for real.
 *
 * Why it is safe to have at all: the audience is constructed here, in memory, as
 * a single recipient — the operator — and `assertOperatorOnlySend` refuses
 * anything else before a message is built. There is no database query for
 * recipients and no campaign registry entry, so the failure mode of a mistake in
 * this file is one extra email to the person running the tests, never a blast to
 * the school.
 *
 * Opt-in only:
 *   CAMPAIGN_LIVE_TEST=1 TMPDIR="$PWD/.scratch" bun test tests/live.test.ts
 */
const LIVE = process.env.CAMPAIGN_LIVE_TEST === "1";

const dirs = useScratchDirs("live");

describe("live email send (opt-in)", () => {
	test("is gated by default, and its guard refuses anything but a lone operator send", () => {
		// A plain `bun test` must never deliver mail. This asserts the gate is
		// closed unless the operator explicitly opened it.
		expect(LIVE).toBe(process.env.CAMPAIGN_LIVE_TEST === "1");

		// The guard the live test depends on, asserted in the DEFAULT run too: if a
		// future edit weakens it, this fails harmlessly here rather than during a
		// live send.
		const audience = [makeRecipient(OPERATOR_EMAIL), makeRecipient("student@example.gr")];
		expect(() => assertOperatorOnlySend(audience)).toThrow(/Refusing to send/);
		expect(() => assertOperatorOnlySend([])).toThrow(/Refusing to send/);
		expect(() => assertOperatorOnlySend([makeRecipient("student@example.gr")])).toThrow(/Refusing to send/);
	});

	test.skipIf(!LIVE)(
		"delivers one real email to the operator and records it, through the real transport",
		async () => {
			// helpers.ts replaced this key with an unusable placeholder at import time
			// so that an accidental send fails instead of emailing students. Loading
			// the real one is therefore deliberate, explicit, and happens only here.
			loadEnvFile(path.resolve(import.meta.dir, "../.env.production"), { override: true });
			const key = process.env.MAILERSEND_API_KEY ?? "";
			expect(key.length).toBeGreaterThan(0);
			expect(key).not.toContain("test-invalid");

			// The audience: one person, built here, never read from the database.
			const recipients = [
				makeRecipient(OPERATOR_EMAIL, {
					templateData: {
						token: "live-test-token",
						first_name: "Kostas",
						last_name: "Δοκιμή",
						am: "0000",
						regid: "live-test-regid",
					},
				}),
			];
			assertOperatorOnlySend(recipients);

			const cfg = makeCampaign({
				id: "live-test",
				title: "Live send test (operator only)",
				subject: `[TEST] Campaign send path — ${new Date().toISOString().slice(0, 16)}`,
				getRecipients: async () => recipients,
				paceMs: 0,
			});

			// collectRecipients runs the real blocklist and dedupe, so the guard is
			// re-asserted on the list that actually reaches the loop.
			const collected = await collectRecipients(cfg, "sqlite-prod", "email");
			expect(collected.recipients).toHaveLength(1);
			assertOperatorOnlySend(collected.recipients);

			// No `emailSend` seam: this is the real MailerSend call, the real template
			// read from html_templates/ and the real placeholder substitution.
			const summary = await runCampaign(cfg, collected, {
				db: "sqlite-prod",
				mode: "send",
				channel: "email",
				quiet: true,
			});

			expect(summary.failed).toBe(0);
			expect(summary.sentNow).toBe(1);

			// State landed in the scratch dir, addressed only to the operator — so the
			// live test also proves resume bookkeeping without touching real state.
			const state = readState(dirs, "live-test");
			expect(state?.sent).toHaveLength(1);
			expect(state?.sent[0]?.email?.toLowerCase()).toBe(OPERATOR_EMAIL);
		},
		60_000,
	);
});

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { collectRecipients, runCampaign, type CollectedRecipients, type RunOptions } from "../src/campaign/runner";
import { saveState, type CampaignState } from "../src/campaign/state";
import type { CampaignRecipient } from "../src/campaign/types";
import { maskPhone } from "../src/sms/phone";
import { blockProviderFetch, makeCampaign, makeRecipient, readState, requireSmsDryRun, useScratchDirs } from "./helpers";

/**
 * The campaign send loop: resume state, the daily cap, per-recipient failures,
 * channel isolation and the SMS pre-flight — all of it exercised for real.
 *
 * Two rules shape every test here. Email never leaves through the transport:
 * the `emailSend` seam in RunOptions replaces only the delivery call, so the
 * loop around it (cap checks, pacing, what lands in state) is the real code.
 * SMS needs no seam because Bird's dry run is a product feature, so the SMS
 * loop runs through the transport it actually has and transmits nothing.
 * And every test installs `blockProviderFetch` for its duration, so a provider
 * request that should not happen fails loudly instead of reaching a student.
 */
const dirs = useScratchDirs("campaign-send");

const SMS_FROM = "BYZSCHOOL";

/** A distinct mobile per index so an SMS run is never deduped or repeated by accident. */
function phoneFor(n: number): string {
	return `+3069700${String(n).padStart(5, "0")}`;
}

/** The shape runCampaign expects once `collectRecipients` has done its job. */
function collected(recipients: CampaignRecipient[], skippedNoAddress = 0): CollectedRecipients {
	return { recipients, skippedNoAddress };
}

/** Send-mode options for the email channel. `paceMs: 0` keeps a suite run instant. */
function emailOpts(overrides: Partial<RunOptions> = {}): RunOptions {
	return { db: "sqlite-dev", mode: "send", channel: "email", paceMs: 0, quiet: true, ...overrides };
}

/** Send-mode options for the SMS channel — dry-run transport, real loop. */
function smsOpts(overrides: Partial<RunOptions> = {}): RunOptions {
	return { db: "sqlite-dev", mode: "send", channel: "sms", paceMs: 0, quiet: true, ...overrides };
}

/** Reads a state file, failing with the campaign/channel named if the run never wrote one. */
function stateOf(campaignId: string, channel: "email" | "sms" = "email"): CampaignState {
	const state = readState(dirs, campaignId, channel);
	if (!state) throw new Error(`Expected a ${channel} state file for "${campaignId}", found none.`);
	return state;
}

/**
 * Collects everything the runner logs, so a test can assert on what an operator
 * would have seen — and so a suite run stays quiet. Always restored in a finally.
 */
function captureOutput(): { lines: string[]; text: () => string; restore: () => void } {
	const lines: string[] = [];
	const original = { log: console.log, warn: console.warn, error: console.error };
	const record = (...args: unknown[]) => {
		lines.push(args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" "));
	};
	console.log = record as typeof console.log;
	console.warn = record as typeof console.warn;
	console.error = record as typeof console.error;
	return {
		lines,
		text: () => lines.join("\n"),
		restore: () => {
			console.log = original.log;
			console.warn = original.warn;
			console.error = original.error;
		},
	};
}

/**
 * Sets BIRD_SMS_FROM for the duration of one run, because an ad-hoc body has no
 * `sms.from` to fall back on and the runner resolves the sender before sending.
 * Restored afterwards so no other test inherits the value.
 */
async function withSmsFrom<T>(fn: () => Promise<T>, from: string = SMS_FROM): Promise<T> {
	const previous = process.env.BIRD_SMS_FROM;
	process.env.BIRD_SMS_FROM = from;
	try {
		return await fn();
	} finally {
		if (previous === undefined) delete process.env.BIRD_SMS_FROM;
		else process.env.BIRD_SMS_FROM = previous;
	}
}

describe("campaign send loop", () => {
	test("a send run delivers every address once, then a second run resumes without re-sending", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const delivered: string[] = [];
		try {
			// One mixed-case address on purpose: resume compares lowercased, so a
			// case difference must not turn into a second email.
			const recipients = [
				makeRecipient("anna@example.gr"),
				makeRecipient("Babis@Example.GR"),
				makeRecipient("giorgos@example.gr"),
			];
			const cfg = makeCampaign({ id: "email-happy", getRecipients: async () => recipients });
			const opts = emailOpts({
				emailSend: async ({ to }) => {
					delivered.push(to);
				},
			});

			const first = await runCampaign(cfg, collected(recipients), opts);
			expect(delivered).toEqual(["anna@example.gr", "Babis@Example.GR", "giorgos@example.gr"]);
			expect(new Set(delivered).size).toBe(3);
			expect(first).toMatchObject({
				total: 3,
				skippedNoAddress: 0,
				sentNow: 3,
				alreadySent: 0,
				failed: 0,
				pausedAtDailyCap: false,
				previewFiles: [],
			});

			const state = stateOf("email-happy");
			expect(state.campaignId).toBe("email-happy");
			expect(state.channel).toBe("email");
			expect(state.failed).toEqual([]);
			expect(state.sent.map((record) => record.key)).toEqual([
				"anna@example.gr",
				"Babis@Example.GR",
				"giorgos@example.gr",
			]);
			for (const record of state.sent) expect(Number.isNaN(Date.parse(record.at))).toBe(false);
			expect(output.text()).toContain("3 to send, 0 already sent");
			expect(output.text()).toContain("Done: 3 sent, 0 failed, 3 total recorded.");

			// The resume contract: same campaign, same audience, nothing delivered twice.
			const second = await runCampaign(cfg, collected(recipients), opts);
			expect(second).toMatchObject({ total: 3, sentNow: 0, alreadySent: 3, failed: 0, pausedAtDailyCap: false });
			expect(delivered).toHaveLength(3);
			expect(output.text()).toContain("0 to send, 3 already sent");
			expect(stateOf("email-happy").sent).toHaveLength(3);
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("a failed address is recorded with its reason and only that address is retried", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const attempted: string[] = [];
		let stillBroken = true;
		try {
			const recipients = [
				makeRecipient("one@example.gr"),
				makeRecipient("broken@example.gr"),
				makeRecipient("two@example.gr"),
			];
			const cfg = makeCampaign({ id: "email-retry", getRecipients: async () => recipients });
			const opts = emailOpts({
				emailSend: async ({ to }) => {
					attempted.push(to);
					if (to === "broken@example.gr" && stillBroken) throw new Error("550 mailbox unavailable");
				},
			});

			const first = await runCampaign(cfg, collected(recipients), opts);
			expect(first).toMatchObject({ total: 3, sentNow: 2, alreadySent: 0, failed: 1 });
			let state = stateOf("email-retry");
			expect(state.sent.map((record) => record.email)).toEqual(["one@example.gr", "two@example.gr"]);
			expect(state.failed).toHaveLength(1);
			expect(state.failed[0]).toMatchObject({
				key: "broken@example.gr",
				email: "broken@example.gr",
				error: "550 mailbox unavailable",
			});
			expect(Number.isNaN(Date.parse(state.failed[0].at))).toBe(false);
			expect(output.text()).toContain("FAILED broken@example.gr: 550 mailbox unavailable");

			// The retry: the previously-failed address is the ONLY one attempted again.
			stillBroken = false;
			const second = await runCampaign(cfg, collected(recipients), opts);
			expect(second).toMatchObject({ total: 3, sentNow: 1, alreadySent: 2, failed: 0 });
			expect(attempted).toEqual([
				"one@example.gr",
				"broken@example.gr",
				"two@example.gr",
				"broken@example.gr",
			]);
			state = stateOf("email-retry");
			expect(state.sent.map((record) => record.email)).toEqual([
				"one@example.gr",
				"two@example.gr",
				"broken@example.gr",
			]);
			// The earlier failure stays on file as history — resume is driven by `sent`.
			expect(state.failed).toHaveLength(1);

			// A third run has nothing left to do at all.
			const third = await runCampaign(cfg, collected(recipients), opts);
			expect(third).toMatchObject({ sentNow: 0, alreadySent: 3, failed: 0 });
			expect(attempted).toHaveLength(4);
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("the daily cap stops a run exactly at the cap and the state file resumes afterwards", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const delivered: string[] = [];
		const id = "capped-2026";
		try {
			// Pre-seed what the day already holds: one send from today (which counts
			// against the cap) and one from long ago (which must not).
			await saveState({
				campaignId: id,
				channel: "email",
				createdAt: "2020-01-01T00:00:00.000Z",
				sent: [
					{ key: "earlier-today@example.gr", email: "earlier-today@example.gr", at: new Date().toISOString() },
					{ key: "last-year@example.gr", email: "last-year@example.gr", at: "2020-01-01T00:00:00.000Z" },
				],
				failed: [],
			});

			const recipients = [
				makeRecipient("cap-1@example.gr"),
				makeRecipient("cap-2@example.gr"),
				makeRecipient("cap-3@example.gr"),
			];
			const emailSend = async ({ to }: { to: string }) => {
				delivered.push(to);
			};
			const cfg = makeCampaign({ id, dailyCap: 2, getRecipients: async () => recipients });

			const first = await runCampaign(cfg, collected(recipients), emailOpts({ emailSend }));
			// Cap 2 with one send already made today: exactly one more goes out, then
			// the loop stops — the third recipient is never attempted. `alreadySent`
			// counts the two pre-seeded records the run found on file.
			expect(first).toMatchObject({
				total: 3,
				sentNow: 1,
				alreadySent: 2,
				failed: 0,
				pausedAtDailyCap: true,
			});
			expect(delivered).toEqual(["cap-1@example.gr"]);
			expect(output.text()).toContain("Daily cap of 2 reached");

			const paused = stateOf(id);
			expect(paused.sent.map((record) => record.key)).toEqual([
				"earlier-today@example.gr",
				"last-year@example.gr",
				"cap-1@example.gr",
			]);
			// The pre-seeded history survived the pause untouched...
			expect(paused.failed).toEqual([]);
			// ...and the file is still a valid resume state, which the next run proves.
			const resumeCfg = makeCampaign({ id, dailyCap: 10, getRecipients: async () => recipients });
			const resumed = await runCampaign(resumeCfg, collected(recipients), emailOpts({ emailSend }));
			expect(resumed).toMatchObject({ total: 3, sentNow: 2, alreadySent: 3, failed: 0, pausedAtDailyCap: false });
			expect(delivered).toEqual(["cap-1@example.gr", "cap-2@example.gr", "cap-3@example.gr"]);
			expect(stateOf(id).sent).toHaveLength(5);
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("email and SMS progress live in separate state files and neither resumes the other", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const id = "both-channels";
		try {
			const recipients = [
				makeRecipient("both-1@example.gr", { phone: phoneFor(1) }),
				makeRecipient("both-2@example.gr", { phone: phoneFor(2) }),
				makeRecipient("both-3@example.gr", { phone: phoneFor(3) }),
			];
			const cfg = makeCampaign({
				id,
				sms: { templateName: "2026/google_review.sms.txt", category: "marketing", from: SMS_FROM, maxSegments: 3 },
				getRecipients: async () => recipients,
			});

			// SMS first, so the email run has something it could wrongly consider done.
			const smsFirst = await runCampaign(cfg, collected(recipients), smsOpts());
			expect(smsFirst).toMatchObject({ total: 3, sentNow: 3, alreadySent: 0, failed: 0 });
			expect(existsSync(path.join(dirs.state, `${id}.sms.json`))).toBe(true);
			expect(existsSync(path.join(dirs.state, `${id}.json`))).toBe(false);
			expect(readState(dirs, id, "email")).toBeNull();

			const smsState = stateOf(id, "sms");
			expect(smsState.channel).toBe("sms");
			expect(smsState.sent.map((record) => record.key)).toEqual(recipients.map((r) => r.phone));
			for (const record of smsState.sent) {
				expect(record.key).toMatch(/^\+30\d{10}$/);
				expect(record.phone).toBe(record.key);
				expect(record.key).not.toContain("@");
			}

			// The email run of the SAME campaign must not treat the SMS sends as done.
			const delivered: string[] = [];
			const email = await runCampaign(
				cfg,
				collected(recipients),
				emailOpts({
					emailSend: async ({ to }) => {
						delivered.push(to);
					},
				}),
			);
			expect(email).toMatchObject({ total: 3, sentNow: 3, alreadySent: 0, failed: 0 });
			expect(delivered).toEqual(recipients.map((r) => r.email));
			expect(existsSync(path.join(dirs.state, `${id}.json`))).toBe(true);

			const emailState = stateOf(id);
			expect(emailState.channel).toBe("email");
			expect(emailState.sent.map((record) => record.key)).toEqual(recipients.map((r) => r.email));

			// And the reverse: each channel resumes against its own file only.
			const dryRunsBefore = output.lines.filter((line) => line.includes("[sms:dry-run]")).length;
			const smsAgain = await runCampaign(cfg, collected(recipients), smsOpts());
			expect(smsAgain).toMatchObject({ sentNow: 0, alreadySent: 3, failed: 0 });
			expect(output.lines.filter((line) => line.includes("[sms:dry-run]"))).toHaveLength(dryRunsBefore);

			const refused: string[] = [];
			const emailAgain = await runCampaign(
				cfg,
				collected(recipients),
				emailOpts({
					emailSend: async ({ to }) => {
						refused.push(to);
						throw new Error("a resume re-delivered an address");
					},
				}),
			);
			expect(emailAgain).toMatchObject({ sentNow: 0, alreadySent: 3, failed: 0 });
			expect(refused).toEqual([]);
			expect(stateOf(id).sent).toHaveLength(3);
			expect(stateOf(id, "sms").sent).toHaveLength(3);
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("an over-budget SMS body aborts before anything is sent, a missing placeholder only skips its recipient", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		try {
			requireSmsDryRun();

			// (a) An over-long body is a property of the copy, not of one recipient,
			// so the whole run must abort during pre-flight: no transport call, no
			// state file, no progress lost.
			const abortId = "sms-over-budget";
			const abortRecipients = [
				makeRecipient("abort-1@example.gr", { phone: phoneFor(11) }),
				makeRecipient("abort-2@example.gr", { phone: phoneFor(12) }),
			];
			const abortCfg = makeCampaign({ id: abortId, getRecipients: async () => abortRecipients });
			await withSmsFrom(async () => {
				await expect(
					runCampaign(
						abortCfg,
						collected(abortRecipients),
						smsOpts({ smsMessage: "α".repeat(300), smsMaxSegments: 2 }),
					),
				).rejects.toThrow(/renders to 5 segment\(s\)[\s\S]*budget is 2/);
			});
			expect(output.lines.filter((line) => line.includes("[sms:dry-run]"))).toEqual([]);
			expect(readState(dirs, abortId, "sms")).toBeNull();
			expect(guard.calls).toEqual([]);

			// (b) A missing personalization value is one recipient's problem: that
			// recipient is recorded as failed, everyone else still goes out.
			const skipId = "sms-missing-regid";
			const withRegid = makeRecipient("has-regid@example.gr", { phone: phoneFor(21) });
			// `makeRecipient`'s `templateData` extra REPLACES the defaults rather than
			// merging into them, so the one recipient with a registration link gets
			// the whole (still valid) data set back.
			withRegid.templateData = { ...withRegid.templateData, regid: "R-9182" };
			const missingRegid = [
				makeRecipient("no-regid-1@example.gr", { phone: phoneFor(22) }),
				makeRecipient("no-regid-2@example.gr", { phone: phoneFor(23) }),
			];
			const skipRecipients = [withRegid, ...missingRegid];
			const skipCfg = makeCampaign({ id: skipId, getRecipients: async () => skipRecipients });
			const summary = await withSmsFrom(() =>
				runCampaign(
					skipCfg,
					collected(skipRecipients),
					smsOpts({ smsMessage: "Γεια σου {{first_name}} — ο σύνδεσμός σου: {{regid}}" }),
				),
			);
			expect(summary).toMatchObject({ total: 3, sentNow: 1, alreadySent: 0, failed: 2 });

			const state = stateOf(skipId, "sms");
			expect(state.sent.map((record) => record.phone)).toEqual([withRegid.phone]);
			expect(state.failed).toHaveLength(2);
			expect(state.failed.map((record) => record.phone)).toEqual(missingRegid.map((r) => r.phone));
			for (const failure of state.failed) {
				expect(failure.key).toMatch(/^\+30\d{10}$/);
				expect(failure.error).toContain("{{regid}}");
			}
			// Every skip is logged, and logged masked — never with the full number.
			for (const recipient of missingRegid) {
				expect(output.text()).toContain(maskPhone(recipient.phone as string));
				expect(output.text()).not.toContain(recipient.phone as string);
			}
			expect(output.text()).toContain("SKIP");
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("the SMS send loop goes through Bird's dry run: accepted, keyed by phone, masked, no fetch", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const id = "sms-dry-loop";
		try {
			requireSmsDryRun();

			const recipients = [
				makeRecipient("sms-1@example.gr", { phone: phoneFor(31) }),
				makeRecipient("sms-2@example.gr", { phone: phoneFor(32) }),
				makeRecipient("sms-3@example.gr", { phone: phoneFor(33) }),
			];
			const cfg = makeCampaign({
				id,
				sms: { templateName: "2026/google_review.sms.txt", category: "marketing", from: SMS_FROM, maxSegments: 3 },
				getRecipients: async () => recipients,
			});

			const summary = await runCampaign(cfg, collected(recipients), smsOpts());
			expect(summary).toMatchObject({
				total: 3,
				skippedNoAddress: 0,
				sentNow: 3,
				alreadySent: 0,
				failed: 0,
				pausedAtDailyCap: false,
				previewFiles: [],
			});

			const state = stateOf(id, "sms");
			expect(state.sent.map((record) => record.key)).toEqual(recipients.map((r) => r.phone));
			expect(state.failed).toEqual([]);
			expect(output.text()).toContain("Done: 3 sent, 0 failed, 3 total recorded.");

			// Accepted by the transport (dry run reports acceptance, not silence),
			// once per recipient.
			const dryRunLines = output.lines.filter((line) => line.startsWith("[sms:dry-run]"));
			expect(dryRunLines).toHaveLength(3);

			// Privacy: the full E.164 number appears nowhere in what an operator
			// would have seen; the masked form is what stands in for it.
			for (const recipient of recipients) {
				expect(output.text()).toContain(maskPhone(recipient.phone as string));
				expect(output.text()).not.toContain(recipient.phone as string);
			}
			expect(output.text()).not.toMatch(/\+\d{10,}/);

			// The transport really is Bird's dry run: not one HTTP request was made.
			expect(guard.calls).toEqual([]);

			// A resume replays nothing — no new state record, no new dry-run send.
			const resumed = await runCampaign(cfg, collected(recipients), smsOpts());
			expect(resumed).toMatchObject({ total: 3, sentNow: 0, alreadySent: 3, failed: 0 });
			expect(output.lines.filter((line) => line.startsWith("[sms:dry-run]"))).toHaveLength(3);
			expect(stateOf(id, "sms").sent).toHaveLength(3);
		} finally {
			output.restore();
			guard.restore();
		}
	});

	test("collectRecipients dedupes on the channel's own address and reports what it dropped", async () => {
		const guard = blockProviderFetch();
		const output = captureOutput();
		const delivered: string[] = [];
		try {
			// Rows chosen so the two channels disagree about what a duplicate is: a
			// shared family mobile is one SMS but two separate emails.
			const rows = [
				makeRecipient("dup@example.gr", { phone: phoneFor(41) }),
				makeRecipient("dup@example.gr", { phone: phoneFor(42) }),
				makeRecipient("shared@example.gr", { phone: phoneFor(43) }),
				makeRecipient("other@example.gr", { phone: phoneFor(43) }),
				makeRecipient("no-phone@example.gr", { phone: undefined }),
				makeRecipient("", { phone: phoneFor(44) }),
				makeRecipient("optout@example.gr", { phone: phoneFor(45) }),
			];
			const cfg = makeCampaign({ id: "collect-2026", getRecipients: async () => rows });

			const email = await collectRecipients(cfg, "sqlite-dev", "email");
			expect(email.recipients.map((r) => r.email)).toEqual([
				"dup@example.gr",
				"shared@example.gr",
				"other@example.gr",
				"no-phone@example.gr",
			]);
			// The empty address is reported; the email opt-out is dropped silently.
			expect(email.skippedNoAddress).toBe(1);
			expect(email.recipients.some((r) => r.email === "optout@example.gr")).toBe(false);
			expect(output.text()).toContain("duplicate email");
			expect(output.text()).toContain("1 duplicate email(s) skipped");

			const sms = await collectRecipients(cfg, "sqlite-dev", "sms");
			expect(sms.recipients.map((r) => r.phone)).toEqual([
				phoneFor(41),
				phoneFor(42),
				phoneFor(43),
				phoneFor(44),
			]);
			expect(sms.skippedNoAddress).toBe(1);
			// The same email address twice is not a duplicate phone, so both rows stay;
			// the shared mobile and the missing number are what get dropped. The email
			// opt-out is dropped on this channel too: collectRecipients runs the email
			// blocklist before the channel-specific one.
			expect(sms.recipients.some((r) => r.email === "optout@example.gr")).toBe(false);

			// --limit truncates the channel-resolved list it was applied to.
			const limited = await collectRecipients(cfg, "sqlite-dev", "email", 2);
			expect(limited.recipients.map((r) => r.email)).toEqual(["dup@example.gr", "shared@example.gr"]);

			// What collection reports is what the summary accounts for.
			const summary = await runCampaign(
				cfg,
				collected(email.recipients, email.skippedNoAddress),
				emailOpts({
					emailSend: async ({ to }) => {
						delivered.push(to);
					},
				}),
			);
			expect(summary).toMatchObject({ total: 4, skippedNoAddress: 1, sentNow: 4, failed: 0 });
			expect(delivered).toEqual(email.recipients.map((r) => r.email));
			expect(guard.calls).toEqual([]);
		} finally {
			output.restore();
			guard.restore();
		}
	});
});

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { campaigns } from "../src/campaign/campaigns";
import { saveState } from "../src/campaign/state";
import type { StatsReport } from "../src/campaign/stats";
import type { CampaignConfig } from "../src/campaign/types";
import { runCli, useScratchDirs, type CliResult } from "./helpers";

/**
 * `src/cli.ts` at the process boundary: argument validation, the CLI's own
 * safety refusals, `--list`/`--help`, and both local forms of `--stats`.
 *
 * Everything here is offline and cheap on purpose. A campaign run queries
 * Cloudflare D1 (~15s per query) and `--send` emails or texts real students, so
 * this file only exercises commands that stop before `collectRecipients`:
 * usage, validation, the refusals, and `--stats` without `--live`/`--delivery`
 * (which reads the state files and nothing else). The send loop is covered
 * in-process by `campaign-send.test.ts`; `--send` is never exercised here.
 *
 * State is written only through `useScratchDirs()`, which points
 * CAMPAIGN_STATE_DIR/CAMPAIGN_OUT_DIR at `.scratch/test-tmp/…`. The child CLI
 * inherits both variables from `runCli`, so no assertion in this file can read
 * or write the repository's real `campaign-state/` or `out/`.
 */
const dirs = useScratchDirs("cli");

/* ------------------------------------------------------------------------- */
/* Fixtures and helpers                                                      */
/* ------------------------------------------------------------------------- */

/** The first registry campaign matching `predicate`; the registry is the source of truth. */
function registryId(predicate: (cfg: CampaignConfig) => boolean, what: string): string {
	const id = Object.keys(campaigns).find((candidate) => predicate(campaigns[candidate]));
	if (!id) throw new Error(`The campaign registry has no ${what}, so this file cannot test one.`);
	return id;
}

/** A campaign configured for email + SMS, and one with no `sms` block at all. */
const SMS_CAPABLE_ID = registryId((cfg) => Boolean(cfg.sms), "campaign with an sms block");
const EMAIL_ONLY_ID = registryId((cfg) => !cfg.sms, "campaign without an sms block");

const DAY_MS = 24 * 60 * 60 * 1000;

/** `n` days ago, as the ISO stamp a state record carries. */
function ago(days: number): string {
	return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * The hand-computed numbers the seeded fixtures must produce.
 *
 * The fixtures are shaped so each total is checkable by eye and so the two
 * windows differ: the email-only campaign's second send is 20 days old, which
 * the default 14-day window excludes and `--days 30` includes.
 */
const SEED = {
	/** SMS-capable campaign, email: 3 distinct sent (2 of them today), 1 distinct failure with 2 records. */
	bothEmailSent: 3,
	bothEmailFailed: 1,
	bothEmailFailureAttempts: 2,
	bothEmailSentToday: 2,
	/** SMS-capable campaign, SMS: 2 distinct sent, 1 failed. */
	bothSmsSent: 2,
	bothSmsFailed: 1,
	/** Email-only campaign: 2 distinct sent (5 and 20 days ago), no failures. */
	emailOnlySent: 2,
	/**
	 * Report-wide totals in the default 14-day window. `failureAttempts` is the
	 * record count, not the headcount: 2 email records for one address plus the
	 * single SMS failure, against 2 distinct failed recipients.
	 */
	all: { campaigns: 2, emailSent: 5, emailFailed: 1, smsSent: 2, smsFailed: 1, sentInWindow: 6, failureAttempts: 3 },
	/** The same totals in a 30-day window: only the in-window count moves. */
	all30: { campaigns: 2, emailSent: 5, emailFailed: 1, smsSent: 2, smsFailed: 1, sentInWindow: 7, failureAttempts: 3 },
	/** One SMS-capable campaign on its own (its email 3 sent + 1 failed, its SMS 2 sent + 1 failed). */
	smsCapableOnly: { campaigns: 1, emailSent: 3, emailFailed: 1, smsSent: 2, smsFailed: 1, sentInWindow: 5, failureAttempts: 3 },
} as const;

/** Writes the two fixtures into the scratch state dir. Idempotent, so either stats test may call it. */
async function seedStatsFixtures(): Promise<void> {
	await saveState({
		campaignId: SMS_CAPABLE_ID,
		channel: "email",
		createdAt: ago(30),
		sent: [
			{ key: "a@example.gr", email: "a@example.gr", at: ago(0) },
			{ key: "b@example.gr", email: "b@example.gr", at: ago(0) },
			{ key: "c@example.gr", email: "c@example.gr", at: ago(3) },
		],
		// The same address twice: one person, two records — which is exactly the
		// distinction between `failed` and `failureAttempts`.
		failed: [
			{ key: "d@example.gr", email: "d@example.gr", at: ago(3), error: "SMTP 550" },
			{ key: "d@example.gr", email: "d@example.gr", at: ago(1), error: "SMTP 550" },
		],
	});
	await saveState({
		campaignId: SMS_CAPABLE_ID,
		channel: "sms",
		createdAt: ago(30),
		sent: [
			{ key: "+306912345678", phone: "+306912345678", at: ago(0) },
			{ key: "+306978096019", phone: "+306978096019", at: ago(2) },
		],
		failed: [{ key: "+306978096020", phone: "+306978096020", at: ago(2), error: "unreachable" }],
	});
	await saveState({
		campaignId: EMAIL_ONLY_ID,
		channel: "email",
		createdAt: ago(60),
		sent: [
			{ key: "x@example.gr", email: "x@example.gr", at: ago(5) },
			// 20 days old: outside the default window, inside `--days 30`.
			{ key: "y@example.gr", email: "y@example.gr", at: ago(20) },
		],
		failed: [],
	});
}

/** Every file the fixtures wrote, which is also the proof that `--stats` wrote nothing. */
const SEEDED_FILES = [`${SMS_CAPABLE_ID}.json`, `${SMS_CAPABLE_ID}.sms.json`, `${EMAIL_ONLY_ID}.json`].sort();

/** Whitespace-collapsed, so a wrapped Greek title still compares equal to its unwrapped form. */
function norm(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * argv containing `--send` that the CLI rejects BEFORE it collects a recipient.
 *
 * `runCli()` refuses any argv containing `--send`, and that rail has to stay:
 * a subprocess with the production database emails the whole campaign. But two
 * of the refusal cases below — and the value check that makes `--sms-message`
 * safe — exist only *because* the argv contains `--send`, so they can never be
 * reached through it. `runCliSendRefusalOnly` is a deliberately narrow second
 * door for exactly these shapes and nothing else. Each is refused in
 * `parseArgs`/`main()` ahead of `collectRecipients`, which the assertions below
 * check by name.
 */
const SEND_REFUSAL_ARGV: readonly (readonly string[])[] = [
	// parseArgs: the following flag is not a body.
	["--sms-message", "--send"],
	// main(): a report never sends, whatever else is passed.
	["--stats", "--send"],
	// main(): the preview database is not a place to send from.
	[SMS_CAPABLE_ID, "--send", "--db", "dev"],
];

/**
 * The one sanctioned way this file runs an argv containing `--send`.
 *
 * It is an allowlist, not a runner: argv that is not one of the documented
 * pre-flight refusals above throws before a process exists. The child is
 * otherwise exactly `runCli`'s — providers disarmed, `ENV_FILE_PROTECT`
 * pinning them, the scratch state dir inherited — and stdin is ignored, so the
 * interactive "type yes to confirm" prompt could not be answered even if one of
 * those refusals were ever removed.
 */
function runCliSendRefusalOnly(args: string[]): CliResult {
	const allowed = SEND_REFUSAL_ARGV.some((shape) => shape.length === args.length && shape.every((arg, i) => arg === args[i]));
	if (!allowed) {
		throw new Error(
			`Refusing to spawn ${JSON.stringify(args)}: this helper exists only for the CLI's pre-flight refusals that ` +
				`contain --send (${SEND_REFUSAL_ARGV.map((shape) => shape.join(" ")).join(" | ")}). Everything else goes ` +
				`through runCli(), and a real send belongs in-process (see live.test.ts).`,
		);
	}
	const proc = Bun.spawnSync({
		cmd: ["bun", path.resolve(import.meta.dir, "../src/cli.ts"), ...args],
		cwd: path.resolve(import.meta.dir, ".."),
		env: {
			...process.env,
			MAILERSEND_API_KEY: "test-invalid-key-never-used",
			BIRD_API_KEY: "",
			BIRD_DRY_RUN: "true",
			ENV_FILE_PROTECT: "MAILERSEND_API_KEY,BIRD_API_KEY,BIRD_DRY_RUN,CAMPAIGN_STATE_DIR,CAMPAIGN_OUT_DIR",
			TMPDIR: path.resolve(import.meta.dir, "../.scratch"),
		},
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** Runs any CLI invocation in this file: `--send` argv takes the allowlisted door. */
function invoke(args: string[]): CliResult {
	return args.includes("--send") ? runCliSendRefusalOnly(args) : runCli(args);
}

/** A crash, not a message: the CLI is supposed to print one actionable line. */
function expectNoStackTrace(text: string, label: string): void {
	const frame = text.split("\n").find((line) => /^\s+at\s/.test(line));
	const bare = text.split("\n").find((line) => /^Error\b/.test(line));
	expect(`${label} :: stack frame :: ${frame ?? "none"}`).toBe(`${label} :: stack frame :: none`);
	expect(`${label} :: bare Error :: ${bare ?? "none"}`).toBe(`${label} :: bare Error :: none`);
}

/** Exit 1, the message on stderr (not stdout), and no stack trace. */
function expectCliRefusal(result: CliResult, args: string[], message: string): void {
	const label = args.join(" ");
	expect(`${label} :: exit ${result.code}`).toBe(`${label} :: exit 1`);
	expect(`${label} :: stderr :: ${result.stderr}`).toContain(message);
	expect(`${label} :: stdout :: ${result.stdout}`).not.toContain(message);
	expectNoStackTrace(result.stderr, label);
}

/** db.ts logs this to stderr before every query: its absence means no database was touched. */
const D1_PROGRESS = "wrangler d1 execute";

/** The report's Totals block. It is the last section in both the framed and the plain layout. */
function totalsBlock(stdout: string): string {
	const lines = stdout.split("\n");
	const start = lines.findIndex((line) => /(^|\s)Totals(\s|$)/.test(line));
	return start < 0 ? "" : lines.slice(start).join("\n");
}

/**
 * One number out of the totals block, in either layout.
 *
 * Line-local and space-only on purpose: collapsing newlines too would let
 * `Email sent` reach past its own value into the `SMS sent` row.
 */
function totalsCell(stdout: string, label: string): number {
	const block = totalsBlock(stdout)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " "))
		.join("\n");
	const match = new RegExp(`${label} +([\\d,]+)`).exec(block);
	if (!match) throw new Error(`the totals block has no "${label}" row:\n${totalsBlock(stdout)}`);
	return Number(match[1].replaceAll(",", ""));
}

/* ------------------------------------------------------------------------- */
/* 1. Argument validation                                                    */
/* ------------------------------------------------------------------------- */

describe("cli", () => {
	test("every malformed invocation is refused with its own message, exit 1 and no stack trace", () => {
		const cases: { args: string[]; message: string }[] = [
			{ args: ["--sms-segments", "0"], message: "--sms-segments must be an integer between 1 and 12" },
			{ args: ["--sms-segments", "13"], message: "--sms-segments must be an integer between 1 and 12" },
			{ args: ["--sms-segments", "abc"], message: "--sms-segments must be an integer between 1 and 12" },
			{ args: ["--days", "0"], message: "--days must be a whole number between 1 and 365" },
			{ args: ["--days", "999"], message: "--days must be a whole number between 1 and 365" },
			{ args: ["--channel", "bogus"], message: "--channel must be email, sms or both" },
			{
				args: ["--sms-category", "bogus"],
				message: "--sms-category must be one of: marketing, transactional, authentication, service",
			},
			{ args: ["--limit", "abc"], message: "--limit must be a positive whole number" },
			{ args: ["--limit", "0"], message: "--limit must be a positive whole number" },
			{ args: ["--preview", "-1"], message: "--preview must be a whole number (0 or more)" },
			{ args: ["--pace", "0"], message: "--pace must be a positive number (milliseconds between sends)" },
			{ args: ["--sms-message"], message: "--sms-message needs a body" },
			// The flag must not be swallowed as the body: that would silently send nothing.
			{ args: ["--sms-message", "--send"], message: "--sms-message needs a body" },
			{ args: ["--bogus"], message: "Unknown option: --bogus" },
			// Two ids: both are unknown, so even a regression here cannot reach D1.
			{ args: ["cli-test-no-such-campaign", "cli-test-second-positional"], message: "Unexpected argument: cli-test-second-positional" },
		];

		for (const { args, message } of cases) {
			const result = invoke(args);
			expectCliRefusal(result, args, message);
			// Nothing ran: no usage text, no campaign header, no database progress.
			expect(`${args.join(" ")} :: stdout :: ${result.stdout}`).toBe(`${args.join(" ")} :: stdout :: `);
			expect(result.stderr).not.toContain(D1_PROGRESS);
		}
	});

	/* ----------------------------------------------------------------------- */
	/* 2. The product's own safety refusals                                    */
	/* ----------------------------------------------------------------------- */

	test("the CLI's safety refusals each explain themselves and stop before any work", () => {
		const refusals: { args: string[]; message: string }[] = [
			// A report reports; accepting both flags would imply it might send.
			{ args: ["--stats", "--send"], message: "--stats only reports" },
			{ args: ["--live"], message: "--live, --delivery, --json and --days only apply to --stats" },
			{ args: ["--delivery"], message: "--live, --delivery, --json and --days only apply to --stats" },
			// A test SMS without the SMS channel would have nothing to sample.
			{ args: [SMS_CAPABLE_ID, "--testsms"], message: "--testsms needs the SMS channel" },
		];
		for (const { args, message } of refusals) {
			const result = invoke(args);
			expectCliRefusal(result, args, message);
			expect(`${args.join(" ")} :: stdout :: ${result.stdout}`).toBe(`${args.join(" ")} :: stdout :: `);
			expect(result.stderr).not.toContain(D1_PROGRESS);
		}

		// Sending from the preview database is never what the operator meant. This
		// guard is the one refusal that speaks after the banner (main() prints the
		// run's parameters first), so stdout is the header and nothing more — the
		// "Email recipients: N" line is what would mean the D1 query had run.
		const devDbArgs = [SMS_CAPABLE_ID, "--send", "--db", "dev"];
		const devDb = invoke(devDbArgs);
		expectCliRefusal(devDb, devDbArgs, "refusing to send with the dev database");
		expect(devDb.stdout).toContain("Recipients: from preview DB");
		expect(devDb.stdout).not.toContain("recipients:");
		expect(devDb.stderr).not.toContain(D1_PROGRESS);

		// A test SMS is refused for a number the campaign could never text: a Greek
		// landline cannot receive one, so the send would fail and still be billed.
		const landlineArgs = [SMS_CAPABLE_ID, "--sms", "--testsms", "2102850060"];
		const landline = invoke(landlineArgs);
		expectCliRefusal(landline, landlineArgs, "not a usable Greek mobile number");
		expect(landline.stderr).toContain("landlines cannot receive SMS");
		expect(landline.stderr).not.toContain(D1_PROGRESS);
		expect(landline.stdout).toBe("");

		// The same number written as a mobile is accepted. `--help` short-circuits
		// before any work, which is the only way to assert acceptance without the
		// ~15s D1 query a real run would need.
		const mobileArgs = [SMS_CAPABLE_ID, "--testsms", "6912345678", "--help"];
		const mobile = invoke(mobileArgs);
		expect(`${mobileArgs.join(" ")} :: exit ${mobile.code}`).toBe(`${mobileArgs.join(" ")} :: exit 0`);
		expect(mobile.stdout).toContain("Usage: bun run campaign");
		expect(mobile.stderr).toBe("");
	});

	/* ----------------------------------------------------------------------- */
	/* 3. A campaign with no SMS copy fails fast                               */
	/* ----------------------------------------------------------------------- */

	test("a campaign with no SMS copy refuses --sms before it pays for a D1 query", () => {
		expect(campaigns[EMAIL_ONLY_ID].sms).toBeUndefined();

		for (const args of [
			[EMAIL_ONLY_ID, "--sms"],
			[EMAIL_ONLY_ID, "--channel", "sms"],
			// `both` includes SMS, so the check must key on the resolved channels.
			[EMAIL_ONLY_ID, "--channel", "both"],
		]) {
			const result = invoke(args);
			expectCliRefusal(result, args, `Campaign "${EMAIL_ONLY_ID}" has no SMS copy`);
			// The message names both ways out: add copy to the campaign, or bring a body.
			expect(result.stderr).toContain("Add an sms block to its CampaignConfig");
			expect(result.stderr).toContain("--sms-message");
			// The point of the fast fail: db.ts logs the query before running it, and
			// no such line means the query was never reached. Nothing on stdout either.
			expect(result.stderr).not.toContain(D1_PROGRESS);
			expect(result.stdout).toBe("");
		}
	});

	/* ----------------------------------------------------------------------- */
	/* 4. --list and --help are honest about capabilities                      */
	/* ----------------------------------------------------------------------- */

	test("--list, --help and an unknown id each tell the truth about the registry", () => {
		const list = runCli(["--list"]);
		expect(list.code).toBe(0);
		expect(list.stderr).not.toContain(D1_PROGRESS);

		const rows = list.stdout.split("\n").filter((line) => /^ {2}\S/.test(line));
		expect(rows).toHaveLength(Object.keys(campaigns).length);
		for (const [id, cfg] of Object.entries(campaigns)) {
			const row = rows.find((line) => line.includes(id));
			expect(`--list row for ${id}: ${row ?? "(missing)"}`).toContain(`[${cfg.sms ? "email, sms" : "email"}]`);
			expect(`--list row for ${id}: ${row ?? "(missing)"}`).toContain(cfg.title);
		}
		// The brackets come from the registry, so the counts have to agree with it.
		const emailOnlyCount = Object.values(campaigns).filter((cfg) => !cfg.sms).length;
		expect(rows.filter((line) => line.includes("[email]"))).toHaveLength(emailOnlyCount);

		const help = runCli(["--help"]);
		expect(help.code).toBe(0);
		expect(help.stderr).toBe("");
		for (const flag of [
			"--channel",
			"--sms ",
			"--sms-message",
			"--sms-category",
			"--sms-segments",
			"--testmail",
			"--testsms",
			"--stats",
			"--live",
			"--delivery",
			"--json",
			"--days",
			"--list",
			"--db",
			"--limit",
			"--pace",
			"--preview",
			"--no-attachment",
			"--yes",
			"--quiet",
			"--send",
		]) {
			expect(`--help documents ${flag.trim()}: ${help.stdout}`).toContain(flag);
		}
		// ...including what the channel flag accepts and that stats is local.
		expect(help.stdout).toContain("email | sms | both");
		expect(help.stdout).toContain("no network, no credentials");

		const unknown = runCli(["cli-test-no-such-campaign"]);
		expect(unknown.code).not.toBe(0);
		expect(unknown.stderr).toContain('Unknown campaign "cli-test-no-such-campaign".');
		expect(unknown.stderr).not.toContain(D1_PROGRESS);
		expectNoStackTrace(unknown.stderr, "unknown campaign");
		// The operator's next move: the list of ids that do exist.
		expect(unknown.stdout).toContain("Available campaigns:");
		for (const id of Object.keys(campaigns)) {
			expect(`unknown-campaign output lists ${id}: ${unknown.stdout}`).toContain(id);
		}
	});

	/* ----------------------------------------------------------------------- */
	/* 5. --stats from seeded state, table form                                */
	/* ----------------------------------------------------------------------- */

	test("--stats reports the seeded numbers, the window it was asked for, and one campaign at a time", async () => {
		await seedStatsFixtures();
		// COLUMNS pins the layout (framed at 120, plain at 50) so these assertions
		// describe the report, not whatever terminal the suite happens to run in.
		const wide = { env: { COLUMNS: "120" } };

		const all = runCli(["--stats"], wide);
		expect(all.code).toBe(0);
		expect(all.stderr).not.toContain(D1_PROGRESS);
		expect(norm(all.stdout)).toContain("Window: last 14 days");
		expect(totalsCell(all.stdout, "Campaigns")).toBe(SEED.all.campaigns);
		expect(totalsCell(all.stdout, "Email sent")).toBe(SEED.all.emailSent);
		expect(totalsCell(all.stdout, "SMS sent")).toBe(SEED.all.smsSent);
		expect(totalsCell(all.stdout, "In window")).toBe(SEED.all.sentInWindow);
		expect(totalsCell(all.stdout, "Failures")).toBe(SEED.all.failureAttempts);
		// Both fixtures are described by their registry titles, not their ids.
		expect(norm(all.stdout)).toContain(norm(campaigns[SMS_CAPABLE_ID].title));
		expect(norm(all.stdout)).toContain(norm(campaigns[EMAIL_ONLY_ID].title));
		// `--stats` only reads: the scratch state dir is exactly what was seeded.
		expect(readdirSync(dirs.state).sort()).toEqual(SEEDED_FILES);

		const month = runCli(["--stats", "--days", "30"], wide);
		expect(month.code).toBe(0);
		expect(norm(month.stdout)).toContain("Window: last 30 days");
		expect(totalsCell(month.stdout, "In window")).toBe(SEED.all30.sentInWindow);
		expect(totalsCell(month.stdout, "Email sent")).toBe(SEED.all30.emailSent);
		// The longer window is the only difference: the same files, the same totals.
		expect(totalsCell(all.stdout, "Email sent")).toBe(totalsCell(month.stdout, "Email sent"));

		// The narrow layout drops the frame but must keep every number.
		const plain = runCli(["--stats"], { env: { COLUMNS: "50" } });
		expect(plain.code).toBe(0);
		expect(plain.stdout).not.toContain("┌");
		expect(totalsCell(plain.stdout, "Email sent")).toBe(SEED.all.emailSent);
		expect(totalsCell(plain.stdout, "SMS sent")).toBe(SEED.all.smsSent);
		expect(totalsCell(plain.stdout, "In window")).toBe(SEED.all.sentInWindow);
		expect(totalsCell(plain.stdout, "Failures")).toBe(SEED.all.failureAttempts);
		expect(norm(plain.stdout)).toContain(norm(campaigns[EMAIL_ONLY_ID].title));

		// One campaign: its own numbers, and no trace of the other one.
		const single = runCli([SMS_CAPABLE_ID, "--stats"], wide);
		expect(single.code).toBe(0);
		expect(single.stderr).not.toContain(D1_PROGRESS);
		expect(totalsCell(single.stdout, "Campaigns")).toBe(1);
		expect(totalsCell(single.stdout, "Email sent")).toBe(SEED.bothEmailSent);
		expect(totalsCell(single.stdout, "SMS sent")).toBe(SEED.bothSmsSent);
		expect(totalsCell(single.stdout, "In window")).toBe(SEED.smsCapableOnly.sentInWindow);
		expect(totalsCell(single.stdout, "Failures")).toBe(SEED.smsCapableOnly.failureAttempts);
		expect(norm(single.stdout)).toContain("Channels configured: Email + SMS");
		expect(norm(single.stdout)).toContain(norm(campaigns[SMS_CAPABLE_ID].title));
		expect(single.stdout).not.toContain(EMAIL_ONLY_ID);
		expect(norm(single.stdout)).not.toContain(norm(campaigns[EMAIL_ONLY_ID].title));
		expect(readdirSync(dirs.state).sort()).toEqual(SEEDED_FILES);

		// A campaign that has never run is an error with the reason, not an empty report.
		const noState = runCli(["cli-test-never-ran", "--stats"], wide);
		expectCliRefusal(noState, ["cli-test-never-ran", "--stats"], 'No recorded activity for campaign "cli-test-never-ran"');
		expect(noState.stderr).toContain("never been sent from this machine");
	});

	/* ----------------------------------------------------------------------- */
	/* 6. --stats --json is machine-readable                                   */
	/* ----------------------------------------------------------------------- */

	test("--stats --json parses cleanly, round-trips the table's totals, and keeps stderr separate", async () => {
		await seedStatsFixtures();

		const table = runCli(["--stats"], { env: { COLUMNS: "120" } });
		const json = runCli(["--stats", "--json"]);
		expect(json.code).toBe(0);
		// `--stats --json > stats.json` only works if stdout is the document and
		// nothing else: a progress or warning line in front of it corrupts the file.
		expect(json.stdout.startsWith("{")).toBe(true);
		expect(json.stdout.trimEnd().endsWith("}")).toBe(true);
		expect(json.stdout).not.toContain(D1_PROGRESS);
		expect(json.stderr).not.toContain('"totals"');
		expectNoStackTrace(json.stderr, "--stats --json");

		const report = JSON.parse(json.stdout) as StatsReport;
		expect(Object.keys(report).sort()).toEqual(["campaigns", "generatedAt", "totals", "windowDays"]);
		expect(Object.keys(report.totals).sort()).toEqual([
			"campaigns",
			"emailFailed",
			"emailSent",
			"failureAttempts",
			"sentInWindow",
			"smsFailed",
			"smsSent",
		]);
		expect(report.windowDays).toBe(14);
		expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
		expect(report.totals).toEqual(SEED.all);

		// The machine-readable form and the table are the same report.
		for (const [label, value] of [
			["Campaigns", report.totals.campaigns],
			["Email sent", report.totals.emailSent],
			["SMS sent", report.totals.smsSent],
			["In window", report.totals.sentInWindow],
			["Failures", report.totals.failureAttempts],
		] as const) {
			expect(`${label} :: ${totalsCell(table.stdout, label)}`).toBe(`${label} :: ${value}`);
		}

		// Every campaign carries the documented per-campaign fields, and says which
		// channels it is configured for (not merely which ones it has run on).
		expect(report.campaigns).toHaveLength(2);
		for (const campaign of report.campaigns) {
			expect(typeof campaign.campaignId).toBe("string");
			expect(typeof campaign.title).toBe("string");
			expect(Array.isArray(campaign.channels)).toBe(true);
			expect(campaign.totalSent).toBe(campaign.channels.reduce((n, channel) => n + channel.sent, 0));
			expect(campaign.totalFailed).toBe(campaign.channels.reduce((n, channel) => n + channel.failed, 0));
		}
		const configured = new Map(report.campaigns.map((campaign) => [campaign.campaignId, campaign.configuredChannels]));
		expect(configured.get(SMS_CAPABLE_ID)).toEqual(["email", "sms"]);
		expect(configured.get(EMAIL_ONLY_ID)).toEqual(["email"]);

		// The window flag reaches the JSON too, and moves only the in-window count.
		const longReport = JSON.parse(runCli(["--stats", "--days", "30", "--json"]).stdout) as StatsReport;
		expect(longReport.windowDays).toBe(30);
		expect(longReport.totals).toEqual(SEED.all30);

		// One campaign, machine-readable: its own totals only.
		const single = JSON.parse(runCli([SMS_CAPABLE_ID, "--stats", "--json"]).stdout) as StatsReport;
		expect(single.campaigns).toHaveLength(1);
		expect(single.campaigns[0].campaignId).toBe(SMS_CAPABLE_ID);
		expect(single.totals).toEqual(SEED.smsCapableOnly);

		// Per channel, the fixtures' own arithmetic: two failure RECORDS are one
		// failed recipient, which is why both numbers are in the report.
		const byChannel = new Map(single.campaigns[0].channels.map((channel) => [channel.channel, channel]));
		expect(byChannel.get("email")).toMatchObject({
			sent: SEED.bothEmailSent,
			failed: SEED.bothEmailFailed,
			failureAttempts: SEED.bothEmailFailureAttempts,
			sentToday: SEED.bothEmailSentToday,
			sentInWindow: SEED.bothEmailSent,
		});
		expect(byChannel.get("sms")).toMatchObject({
			sent: SEED.bothSmsSent,
			failed: SEED.bothSmsFailed,
			failureAttempts: 1,
			sentInWindow: SEED.bothSmsSent,
		});
		// The email-only campaign has run on email alone, and that is all it reports.
		const emailOnly = JSON.parse(runCli([EMAIL_ONLY_ID, "--stats", "--json"]).stdout) as StatsReport;
		expect(emailOnly.campaigns).toHaveLength(1);
		expect(emailOnly.campaigns[0].configuredChannels).toEqual(["email"]);
		expect(emailOnly.campaigns[0].channels.map((channel) => channel.channel)).toEqual(["email"]);
		expect(emailOnly.campaigns[0].totalSent).toBe(SEED.emailOnlySent);

		// Reading a report never rewrites state.
		expect(readdirSync(dirs.state).sort()).toEqual(SEEDED_FILES);
	});
});

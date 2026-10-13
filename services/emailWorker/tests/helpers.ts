import { afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { CampaignConfig, CampaignRecipient } from "../src/campaign/types";
import type { CampaignState } from "../src/campaign/state";

/**
 * Shared harness for the campaign test suite.
 *
 * Two things here are load-bearing and must not be weakened:
 *
 * 1. NOTHING REAL IS EVER SENT except through the single gated path below. The
 *    campaign CLI talks to MailerSend (real email to real students) and Bird
 *    (real SMS, billed per segment). A test that reaches either by accident is
 *    not a flaky test, it is an incident — so the harness denies both by
 *    default rather than trusting each test to remember.
 * 2. Tests never touch the repository's own `campaign-state/` or `out/`. Writing
 *    test state there would mark real students as already-sent and silently
 *    shrink a live campaign, so every run is redirected into `.scratch/`.
 */

/**
 * The only address a real send is ever allowed to reach, and the only one the
 * harness will let through `assertOperatorOnlySend`.
 */
export const OPERATOR_EMAIL = (process.env.TEST_MAIL_TO || "koxafis@gmail.com").trim().toLowerCase();

/**
 * The real opt-out list is a gitignored local file; tests always use the
 * committed fixture instead (one `optout@example.gr` entry), so they behave the
 * same on every machine and never depend on — or reveal — real addresses.
 */
process.env.CAMPAIGN_BLOCKLIST_FILE = path.join(import.meta.dir, "fixtures", "campaign-blocklist.json");

/**
 * Disarm both providers for the whole test process, at import time.
 *
 * This is the belt to `assertOperatorOnlySend`'s braces, and it is deliberate
 * that it happens as a side effect of importing the harness: Bun auto-loads
 * `.env.development`, which holds the REAL MailerSend key, so an in-process
 * test that forgets the transport seam would otherwise email actual students.
 * With the key replaced by an unusable placeholder, that mistake fails at
 * MailerSend's auth check instead.
 *
 * `live.test.ts` is the single place allowed to load the real key back, and it
 * does so explicitly and only after proving its audience is one person.
 */
process.env.MAILERSEND_API_KEY = "test-invalid-key-never-used";
process.env.BIRD_DRY_RUN = "true";
process.env.BIRD_API_KEY = "";

/** Everything a test writes lands under here — inside the repo, so the file sandbox allows it. */
const TEST_TMP_ROOT = path.resolve(import.meta.dir, "../.scratch/test-tmp");

export type ScratchDirs = { root: string; state: string; out: string };

/**
 * Redirects the campaign tooling's two writable directories into a scratch
 * folder for this test file, and deletes it afterwards.
 *
 * Both directories are read from the environment at call time (see
 * `CAMPAIGN_STATE_DIR` in src/campaign/state.ts and `CAMPAIGN_OUT_DIR` in
 * src/campaign/runner.ts), which is exactly why they are overridable: the
 * alternative is a test suite that rewrites real resume state.
 */
export function useScratchDirs(label: string): ScratchDirs {
	const root = path.join(TEST_TMP_ROOT, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	const dirs: ScratchDirs = { root, state: path.join(root, "campaign-state"), out: path.join(root, "out") };
	mkdirSync(dirs.state, { recursive: true });
	mkdirSync(dirs.out, { recursive: true });
	process.env.CAMPAIGN_STATE_DIR = dirs.state;
	process.env.CAMPAIGN_OUT_DIR = dirs.out;
	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});
	return dirs;
}

/** Reads a state file out of the scratch state dir the way the runner would. */
export function readState(dirs: ScratchDirs, campaignId: string, channel: "email" | "sms" = "email"): CampaignState | null {
	const file = path.join(dirs.state, channel === "sms" ? `${campaignId}.sms.json` : `${campaignId}.json`);
	try {
		return JSON.parse(readFileSync(file, "utf8")) as CampaignState;
	} catch {
		return null;
	}
}

/** A synthetic recipient. Defaults are valid on both channels unless overridden. */
export function makeRecipient(email: string, extra: Partial<CampaignRecipient> = {}): CampaignRecipient {
	return {
		email,
		phone: "+306912345678",
		templateData: { token: "tok123", first_name: "Μαρία", last_name: "Παπαδοπούλου", am: "1234", ...(extra.templateData ?? {}) },
		...extra,
	};
}

/**
 * A synthetic campaign.
 *
 * `getRecipients` returns whatever the test hands it, so the send loop, the
 * stats and the blocklists can all be exercised without a database — no D1
 * query, no network, no dependence on whatever production happens to contain.
 */
export function makeCampaign(overrides: Partial<CampaignConfig> = {}): CampaignConfig {
	return {
		id: "test-campaign",
		title: "Δοκιμαστική καμπάνια",
		subject: "Δοκιμή",
		htmlTemplateName: "2026/google_review.html",
		plainTextTemplateName: "2026/google_review.txt",
		// An empty audience by default: a test must say who it is sending to.
		getRecipients: async () => [],
		paceMs: 1,
		dailyCap: 900,
		...overrides,
	};
}

/**
 * The one sanctioned route for a test to deliver anything for real: a single
 * message whose only recipient is the operator.
 *
 * Why this exists at all: the send loop's state, resume and cap behaviour can
 * only be proven by running it, and the operator explicitly wants the email
 * `--send` path covered. Constraining it to `recipients.length === 1` and to
 * the operator's own address is what makes that safe — a mistake here sends one
 * extra email to the person running the tests, not a campaign to the school.
 */
export function assertOperatorOnlySend(recipients: CampaignRecipient[]): void {
	if (recipients.length !== 1) {
		throw new Error(
			`Refusing to send: a real send test must have exactly ONE recipient, got ${recipients.length}. ` +
				`Point it at a synthetic list containing only ${OPERATOR_EMAIL}.`,
		);
	}
	const only = recipients[0].email.trim().toLowerCase();
	if (only !== OPERATOR_EMAIL) {
		throw new Error(`Refusing to send: the only recipient must be ${OPERATOR_EMAIL}, got "${only}".`);
	}
}

export type CliResult = { code: number; stdout: string; stderr: string };

/**
 * Runs the real CLI in a child process with the providers disarmed.
 *
 * The child environment pins an unusable `MAILERSEND_API_KEY` and sets
 * `ENV_FILE_PROTECT` so no `.env.*` file can replace it, meaning an accidental
 * email send fails at MailerSend's auth check instead of reaching a student.
 * `BIRD_DRY_RUN=true` does the same for SMS.
 *
 * `--send` is refused outright: the CLI's send path with the production
 * database emails the entire campaign, and no subprocess test has any business
 * doing that. The gated live test in live.test.ts covers the send path
 * in-process, with a one-recipient operator audience.
 */
export function runCli(args: string[], opts: { env?: Record<string, string> } = {}): CliResult {
	if (args.includes("--send")) {
		throw new Error(
			"runCli() refused --send. A subprocess run would email or text the real campaign audience. " +
				"Cover the send loop in-process with a synthetic single-recipient list (see live.test.ts), " +
				"or assert the refusal paths instead.",
		);
	}

	const cli = path.resolve(import.meta.dir, "../src/cli.ts");
	const proc = Bun.spawnSync({
		cmd: ["bun", cli, ...args],
		cwd: path.resolve(import.meta.dir, ".."),
		env: {
			...process.env,
			// Pinned so `.env.production` cannot swap the real key back in.
			MAILERSEND_API_KEY: "test-invalid-key-never-used",
			BIRD_API_KEY: "",
			BIRD_DRY_RUN: "true",
			ENV_FILE_PROTECT: "MAILERSEND_API_KEY,BIRD_API_KEY,BIRD_DRY_RUN,CAMPAIGN_STATE_DIR,CAMPAIGN_OUT_DIR",
			TMPDIR: path.resolve(import.meta.dir, "../.scratch"),
			...(opts.env ?? {}),
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	return {
		code: proc.exitCode ?? -1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

/**
 * Replaces `fetch` with a recorder that refuses any provider call.
 *
 * For in-process tests: it proves the code under test made (or did not make) a
 * request, and it makes an unexpected one fail loudly rather than reaching
 * MailerSend or Bird. Always restore it in an `afterEach`.
 */
export function blockProviderFetch(): { calls: string[]; restore: () => void } {
	const original = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		calls.push(url);
		if (/mailersend|bird\.com|platform\.bird/i.test(url)) {
			throw new Error(`Blocked a live provider call from a test: ${url}`);
		}
		return original(input as RequestInfo, init);
	}) as typeof fetch;
	return { calls, restore: () => { globalThis.fetch = original; } };
}

/**
 * Guards that this process cannot send a real SMS, whatever a test does.
 *
 * The operator's rule is absolute: the SMS suite must never cover a live send,
 * because every message is billed and a re-run multiplies the cost. Bird's own
 * dry-run is the product's answer, and this makes it a precondition rather than
 * a convention.
 */
export function requireSmsDryRun(): void {
	if (process.env.BIRD_DRY_RUN !== "true" && process.env.BIRD_DRY_RUN !== "1") {
		throw new Error(
			"Refusing to run SMS tests without BIRD_DRY_RUN=true. A live SMS costs real money per segment.",
		);
	}
}

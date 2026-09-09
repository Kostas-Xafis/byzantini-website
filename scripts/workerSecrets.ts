#!/usr/bin/env bun
/**
 * workerSecrets.ts — create / rotate the shared site ↔ aux-worker secrets.
 *
 * The site ↔ workers are authenticated with two shared-token pairs; each side
 * of a pair must hold the SAME value:
 *
 *   PDF pair:   site `PDF_SERVICE_AUTH_TOKEN`              ↔  pdfWorker  `SERVICE_AUTH_TOKEN`
 *   Email pair: site `AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN` ↔  emailWorker `SERVICE_AUTH_TOKEN`
 *
 * This script writes/rotates those pairs on the DEPLOYED Cloudflare Workers
 * (the site worker's named environments + optionally the base worker, and the
 * two aux workers). It requires `wrangler login` (or CLOUDFLARE_API_TOKEN) and
 * real credentials — run manually, never in tests/CI casually. Values are
 * generated locally with node:crypto (or read from environment variables with
 * --from-env), are never passed as CLI arguments and are never printed; they
 * travel in 0600 temp JSON files handed to `wrangler secret bulk`
 * (non-interactive by design) that are deleted afterwards. A `wrangler whoami`
 * preflight runs before anything is written, and failures print the FULL
 * wrangler output — never a truncated banner.
 *
 * After each successful pair write, the value is ALSO mirrored into the local
 * env files that carry that side of the pair (site `.env`/`.env.production`,
 * the services' `.dev.vars` + `.env.development`/`.env.production`), so local
 * dev, `templates:build` and rebuilds stay in sync with the deployed secrets.
 * Disable with --no-env-files. Values are never echoed — only the file names.
 */

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const USAGE = `Usage (from the repo root, Bun only):
  bun run worker-secrets                       # rotate BOTH pairs on all targets
  bun run worker-secrets --pair email          # rotate only the email pair
  bun run worker-secrets --pair pdf --envs production
  bun run worker-secrets --top-level           # also target the base worker (byzantini-website)
  bun run worker-secrets --from-env            # take values from PDF_SERVICE_AUTH_TOKEN /
                                               #   AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN env vars
  bun run worker-secrets --no-env-files        # do NOT mirror values into local env files
  bun run worker-secrets --dry-run             # print the plan only (no changes)
  bun run worker-secrets --list                # list existing secret names per worker

Flags:
  --pair <pdf|email|all>   which pair(s) to set      default: all
  --envs <env1,env2>       site named environments   default: production,preview
  --top-level              also set on the base worker (byzantini-website)
  --pdf-worker <name>      override pdfWorker target (default byzantini-website-pdf-gen)
  --email-worker <name>    override emailWorker target (default byzantini-website-emails)
  --from-env               read values from the site-side env var names instead of generating
  --no-env-files           skip mirroring into local .env/.dev.vars/.env.* files
  --verify                 after writing, run \`wrangler secret list\` on every target
  --yes / -y               skip the confirmation prompt (required when stdin is not a TTY)
  --dry-run                only print what would be set
  --list                   list existing secrets (names only) and exit`;

const ROOT = resolve(import.meta.dir, "..");
const SITE_CONFIG = resolve(ROOT, "wrangler.jsonc");
const SITE_BASE_NAME = "byzantini-website";
const PDF_CONFIG = resolve(ROOT, "services/pdfWorker/wrangler.jsonc");
const EMAIL_CONFIG = resolve(ROOT, "services/emailWorker/wrangler.jsonc");

type Pair = "pdf" | "email";
const PAIRS: Record<Pair, { siteKey: string; workerKey: string }> = {
	pdf: { siteKey: "PDF_SERVICE_AUTH_TOKEN", workerKey: "SERVICE_AUTH_TOKEN" },
	email: { siteKey: "AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN", workerKey: "SERVICE_AUTH_TOKEN" },
};

/**
 * Local env files that carry each side of a pair (paths relative to ROOT).
 * Every rotated value is mirrored into these so local dev (`astro dev` reads
 * `.env`), the services' `wrangler dev` (reads their `.dev.vars`) and the CLI
 * (`templates:build` reads the emailWorker `.env.development/.env.production`)
 * stay in sync with the deployed secrets.
 */
export const ENV_MIRRORS: Record<Pair, { file: string; key: string }[]> = {
	pdf: [
		{ file: ".env", key: PAIRS.pdf.siteKey },
		{ file: ".env.production", key: PAIRS.pdf.siteKey },
		{ file: "services/pdfWorker/.dev.vars", key: PAIRS.pdf.workerKey },
		{ file: "services/pdfWorker/.env.production", key: PAIRS.pdf.workerKey },
	],
	email: [
		{ file: ".env", key: PAIRS.email.siteKey },
		{ file: ".env.production", key: PAIRS.email.siteKey },
		{ file: "services/emailWorker/.dev.vars", key: PAIRS.email.workerKey },
		{ file: "services/emailWorker/.env.development", key: PAIRS.email.workerKey },
		{ file: "services/emailWorker/.env.production", key: PAIRS.email.workerKey },
	],
};

/** Upsert `KEY=value` into a local env file, preserving the rest of the file and its mode. */
export function upsertEnvFile(filePath: string, key: string, value: string): void {
	const absolute = resolve(ROOT, filePath);
	const mode = existsSync(absolute) ? statSync(absolute).mode : 0o600;
	let content = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
	const lineRe = new RegExp(`^${key}=.*$`, "m");
	const line = `${key}=${value}`;
	if (lineRe.test(content)) {
		content = content.replace(lineRe, line);
	} else {
		const trimmed = content.replace(/\s+$/, "");
		content = trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
	}
	writeFileSync(absolute, content, { mode });
}

interface Options {
	pair: Pair | "all";
	envs: string[];
	topLevel: boolean;
	pdfWorker: string;
	emailWorker: string;
	fromEnv: boolean;
	noEnvFiles: boolean;
	verify: boolean;
	yes: boolean;
	dryRun: boolean;
	list: boolean;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = {
		pair: "all",
		envs: ["production", "preview"],
		topLevel: false,
		pdfWorker: "byzantini-website-pdf-gen",
		emailWorker: "byzantini-website-emails",
		fromEnv: false,
		noEnvFiles: false,
		verify: false,
		yes: false,
		dryRun: false,
		list: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => argv[++i] ?? "";
		switch (arg) {
			case "--pair":
				opts.pair = value() as Options["pair"];
				break;
			case "--envs":
				opts.envs = value()
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				break;
			case "--top-level":
				opts.topLevel = true;
				break;
			case "--pdf-worker":
				opts.pdfWorker = value();
				break;
			case "--email-worker":
				opts.emailWorker = value();
				break;
			case "--from-env":
				opts.fromEnv = true;
				break;
			case "--no-env-files":
				opts.noEnvFiles = true;
				break;
			case "--verify":
				opts.verify = true;
				break;
			case "--yes":
			case "-y":
				opts.yes = true;
				break;
			case "--dry-run":
				opts.dryRun = true;
				break;
			case "--list":
				opts.list = true;
				break;
			case "--help":
			case "-h":
				console.log(USAGE);
				process.exit(0);
			default:
				if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}\n\n${USAGE}`);
		}
	}
	if (!["pdf", "email", "all"].includes(opts.pair)) throw new Error(`Invalid --pair: ${opts.pair} (pdf|email|all)`);
	return opts;
}

interface Target {
	label: string;
	config: string;
	env?: string;
	nameOverride?: string;
}

const pairsOf = (pair: Options["pair"]): Pair[] => (pair === "all" ? (["pdf", "email"] as Pair[]) : [pair]);

/** Where a site-side key must be written: base worker + named environments. */
function siteTargets(envs: string[], topLevel: boolean): Target[] {
	const targets: Target[] = [];
	if (topLevel) targets.push({ label: `${SITE_BASE_NAME} (site · base)`, config: SITE_CONFIG });
	for (const env of envs) targets.push({ label: `${SITE_BASE_NAME}-${env} (site · ${env})`, config: SITE_CONFIG, env });
	return targets;
}

function auxTarget(pair: Pair, opts: Options): Target {
	if (pair === "pdf")
		return {
			label: `${opts.pdfWorker} (pdfWorker)`,
			config: PDF_CONFIG,
			nameOverride: opts.pdfWorker === "byzantini-website-pdf-gen" ? undefined : opts.pdfWorker,
		};
	return {
		label: `${opts.emailWorker} (emailWorker)`,
		config: EMAIL_CONFIG,
		nameOverride: opts.emailWorker === "byzantini-website-emails" ? undefined : opts.emailWorker,
	};
}

const targetsOf = (pair: Pair, opts: Options): Target[] => [auxTarget(pair, opts), ...siteTargets(opts.envs, opts.topLevel)];

/** Which secret key a target receives for a pair. */
const keyFor = (pair: Pair, target: Target): string =>
	target.config === PDF_CONFIG || target.config === EMAIL_CONFIG ? PAIRS[pair].workerKey : PAIRS[pair].siteKey;

/** Flags selecting the worker a command operates on. */
const targetFlags = (target: Target): string[] => {
	const flags = ["--config", target.config];
	if (target.env) flags.push("--env", target.env);
	if (target.nameOverride) flags.push("--name", target.nameOverride);
	return flags;
};

async function runWrangler(args: string[]): Promise<{ code: number; output: string }> {
	const proc = Bun.spawn(["bunx", "wrangler", ...args], {
		cwd: ROOT,
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
	});
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	await proc.exited;
	return { code: proc.exitCode ?? -1, output: (stdout + stderr).trim() };
}

/** Writes `{key: value}` secrets via `wrangler secret bulk` (JSON file — non-interactive, no stdin plumbing). */
async function bulkSecrets(target: Target, jsonFile: string): Promise<{ code: number; output: string }> {
	return runWrangler(["secret", "bulk", jsonFile, ...targetFlags(target)]);
}

/** Full wrangler output on failure — the real reason is always shown, never truncated. */
function printFailure(label: string, res: { code: number; output: string }): void {
	console.error(`✗ ${label} (exit ${res.code})`);
	for (const line of res.output.split("\n")) console.error(line ? `   ${line}` : "");
}

async function confirmRotation(what: string): Promise<boolean> {
	if (!process.stdin.isTTY) {
		console.error(`stdin is not a TTY — pass --yes to run: ${what}`);
		process.exit(2);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = (await rl.question(`${what}\nContinue? [y/N] `)) || "n";
	rl.close();
	return /^y(es)?$/i.test(answer.trim());
}

async function listSecrets(targets: Target[]): Promise<void> {
	for (const target of targets) {
		const res = await listSecretsOne(target);
		if (res.code === 0) {
			console.log(`✓ ${target.label}`);
			for (const line of res.output.split("\n").filter((l) => l.trim())) console.log("   " + line);
		} else {
			printFailure(target.label, res);
		}
	}
}

async function listSecretsOne(target: Target): Promise<{ code: number; output: string }> {
	return runWrangler(["secret", "list", ...targetFlags(target)]);
}

/** Before any write: make sure wrangler has credentials (login or CLOUDFLARE_API_TOKEN). */
async function assertAuthenticated(): Promise<void> {
	console.log("Checking wrangler authentication…");
	const res = await runWrangler(["whoami"]);
	// NOTE: `wrangler whoami` exits 0 even when unauthenticated, so detect from
	// its output ("You are logged in with an OAuth/API token ...") instead.
	const authenticated = /logged in with (an oauth|an api|a service) token/i.test(res.output);
	if (!authenticated) {
		console.error(
			"Wrangler has no credentials in this environment. In an interactive terminal run\n" +
				"  bunx wrangler login\n" +
				"once (or export CLOUDFLARE_API_TOKEN for headless runs), then retry. A plain\n" +
				"`secret bulk`/`secret put` cannot log in by itself: it needs an existing session.",
		);
		for (const line of res.output.split("\n").slice(0, 8)) console.error(line ? "   " + line : "");
		process.exit(2);
	}
	const email = res.output.match(/associated with the (?:email|account) '([^']+)'/);
	if (email) console.log(`Authenticated as ${email[1]}`);
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const pairs = pairsOf(opts.pair);
	const targets = pairs.flatMap((p) => targetsOf(p, opts));

	if (opts.list) {
		console.log("Existing secrets (names only):");
		await listSecrets(targets);
		return;
	}

	const planClean: string[] = [];
	for (const pair of pairs) for (const t of targetsOf(pair, opts)) planClean.push(`  ${keyFor(pair, t).padEnd(38)}→  ${t.label}`);

	if (opts.dryRun) {
		console.log(`Dry run — would set ${planClean.length} secret(s):\n${planClean.join("\n")}`);
		return;
	}

	console.log(`This will set ${planClean.length} secret(s):\n${planClean.join("\n")}`);
	if (!opts.yes && !(await confirmRotation("Rotate the shared secrets on the deployed workers?"))) {
		console.log("Aborted.");
		return;
	}

	await assertAuthenticated();

	const tmpDir = mkdtempSync(resolve(tmpdir(), "worker-secrets-"));
	let failed = false;
	try {
		for (const pair of pairs) {
			// One value per pair (both sides must match); never on argv, never printed.
			const value = opts.fromEnv ? process.env[PAIRS[pair].siteKey] : randomBytes(32).toString("hex");
			if (!value) {
				console.error(`Missing $${PAIRS[pair].siteKey} for --from-env (${pair} pair).`);
				failed = true;
				continue;
			}

			const pairFailedBefore = failed;
			for (const target of targetsOf(pair, opts)) {
				const key = keyFor(pair, target);
				// `secret bulk` reads {key: value} from a 0600 JSON file — fully
				// non-interactive, no stdin plumbing, no values on argv.
				const jsonFile = resolve(tmpDir, `${pair}-${key}.json`);
				writeFileSync(jsonFile, JSON.stringify({ [key]: value }), { mode: 0o600 });
				chmodSync(jsonFile, 0o600);

				const res = await bulkSecrets(target, jsonFile);
				if (res.code === 0) {
					console.log(`✓ ${key}  →  ${target.label}`);
				} else {
					failed = true;
					printFailure(`${key}  →  ${target.label}`, res);
				}
			}

			// Mirror the value into the local env files ONLY when this pair had
			// no new failures (otherwise files would drift from CF).
			if (opts.noEnvFiles) {
				// skip mirroring
			} else if (failed === pairFailedBefore) {
				for (const { file, key } of ENV_MIRRORS[pair]) {
					try {
						upsertEnvFile(file, key, value);
						console.log(`✓ ${key}  →  ${relative(ROOT, resolve(ROOT, file))} (env mirror)`);
					} catch (e) {
						console.error(`✗ env mirror failed for ${file}: ${e instanceof Error ? e.message : e}`);
					}
				}
			} else {
				console.error(`✗ skipping env mirrors for the ${pair} pair — some targets failed (files would drift from CF).`);
			}
		}

		if (opts.verify && !failed) {
			console.log("\nVerifying (secret names only):");
			await listSecrets(targets);
		}
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	console.log("\nRotation finished.");
	console.log(
		"Local env files were updated by this run (site .env/.env.production, services' .dev.vars and\n" +
			"  emailWorker .env.development/.env.production) — local dev, `wrangler dev` and\n" +
			"  `templates:build --prod/--dev` now use the new values automatically. Use --no-env-files to skip.\n" +
			"  Values are never printed by this script, by design.",
	);

	if (failed) process.exitCode = 1;
}

if (import.meta.main) {
	main().catch((e: unknown) => {
		console.error(e instanceof Error ? e.message : e);
		process.exitCode = 1;
	});
}

import { readFileSync } from "node:fs";

/**
 * Minimal KEY=VALUE env loader — used so `bun run campaign ...`,
 * `bun run remove-suppressed ...` and `bun run templates:build --prod/--dev`
 * work with the repo-local env files without extra shell flags.
 *
 * IMPORTANT — why `override` exists:
 * Bun auto-loads `.env`, `.env.local` and `.env.<NODE_ENV>` BEFORE the script
 * runs. `NODE_ENV` is unset for these CLI scripts, so Bun defaults to the
 * *development* file and every key in `.env.development` is already present in
 * `process.env` by the time a CLI explicitly picks an environment. With the
 * historical "never overwrite an existing key" rule the explicit choice lost
 * silently: `templates:build --prod` loaded `.env.production` but kept the
 * auto-loaded `EMAIL_WORKER_URL=http://127.0.0.1:8788`, so the "production"
 * publish POSTed to localhost and died with `ConnectionRefused`.
 *
 * Pass `override: true` whenever the CALLER deliberately selected the file
 * (a `--prod` / `--dev` / `--db prod` flag): the selected file then wins over
 * Bun's implicit auto-load. Leave it off to keep the plain "real shell env
 * wins" behaviour.
 */
/**
 * Keys the caller has deliberately pinned, which no env file may overwrite even
 * when `override` is set.
 *
 * Why this exists: `override: true` is correct for the values an env file owns
 * (EMAIL_WORKER_URL, the D1 database names), but wrong for a secret the caller
 * injected into THIS process. Two real cases: a CI job supplying its own
 * MAILERSEND_API_KEY, and the test suite pinning the key to an unusable value
 * so that an accidental `--send` fails at the provider instead of emailing real
 * people. Set `ENV_FILE_PROTECT` to a comma-separated list of key names; a
 * listed key is left alone only when it is already set, so an env file still
 * provides it when the caller did not.
 */
function protectedKeys(): Set<string> {
	return new Set(
		(process.env.ENV_FILE_PROTECT ?? "")
			.split(",")
			.map((key) => key.trim())
			.filter(Boolean),
	);
}

export function loadEnvFile(filePath: string, options: { override?: boolean } = {}) {
	try {
		const pinned = protectedKeys();
		const content = readFileSync(filePath, "utf8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let value = trimmed.slice(eq + 1).trim();
			if (
				value.length >= 2 &&
				((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
			) {
				value = value.slice(1, -1);
			}
			if (pinned.has(key) && key in process.env) continue;
			if (options.override || !(key in process.env)) process.env[key] = value;
		}
	} catch (e) {
		console.warn(`Could not load env file ${filePath}: ${e}`);
	}
}

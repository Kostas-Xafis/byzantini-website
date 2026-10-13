import { render } from "@react-email/render";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { templates } from "../render/index";
import { smsTemplates } from "../render/sms/index";
import { loadEnvFile } from "../src/loadEnvFile";
import { estimateSegments } from "../src/sms/segments";

/**
 * Compiles the React Email template registry into static HTML files under
 * html_templates/ and, when PROJECT_ABSOLUTE_PATH is set, mirrors them into
 * bucket/latest/html_templates/.
 *
 * The same run compiles the SMS registry (render/sms/index.tsx) to plain text
 * under sms_templates/ — see the SMS section near the bottom.
 *
 * Usage:
 *   bun run templates:build              # local files only
 *   bun run templates:build --prod       # also publish via the email worker's R2 binding (deployed worker)
 *   bun run templates:build --dev        # also publish via the email worker running locally (wrangler dev on 8788)
 *   bun run templates:build --prod --dry-run   # show the resolved target and stop before publishing
 *
 * Publishing POSTs the built files to <EMAIL_WORKER_URL>/html-templates
 * (byzantini-website-emails), which writes them to the R2 bucket binding at
 * exactly "html_templates/<name>" — the keys the site serves
 * (src/pages/[...slug].ts -> Bucket.get). No S3 credentials needed.
 * SMS bodies are never published; they stay local to the CLI.
 */
const args = process.argv.slice(2);
const wantsProd = args.includes("--prod");
const wantsDev = args.includes("--dev");
if (wantsProd && wantsDev) throw new Error("Pass either --prod or --dev, not both.");
const uploadTarget: "prod" | "dev" | null = wantsProd ? "prod" : wantsDev ? "dev" : null;
/** `--dry-run`: build + report the publish target, but make no network request. */
const dryRun = args.includes("--dry-run");

/** Bird rejects a free-text SMS above 12 segments outright, so warn when a body approaches it. */
const SMS_HARD_CAP = 12;

const envDir = path.resolve(import.meta.dir, "../src/..");
const envFile = uploadTarget === "prod" ? ".env.production" : uploadTarget === "dev" ? ".env.development" : null;

// `override: true` — the target was picked explicitly on the command line, so
// the matching env file MUST win over the `.env.development` Bun auto-loaded
// before this script started. Without it, `--prod` kept the dev
// `EMAIL_WORKER_URL` (http://127.0.0.1:8788) and every "production" publish
// failed with ConnectionRefused. See src/loadEnvFile.ts.
if (envFile) loadEnvFile(path.join(envDir, envFile), { override: true });

const templatesDir = path.resolve(import.meta.dir, "../html_templates");
const projectPath = process.env.PROJECT_ABSOLUTE_PATH;
const bucketTemplatesDir = projectPath ? path.resolve(projectPath, "bucket/latest/html_templates") : null;

/** A URL that points back at this machine (wrangler dev), never at production. */
const LOCAL_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?(\/|$)/i;

/**
 * Resolves — and sanity-checks — where the publish would go, so a wrong or
 * stale env file fails loudly instead of silently hitting the wrong worker.
 */
function resolvePublishTarget(): { workerUrl: string; authToken: string } {
	const workerUrl = (process.env.EMAIL_WORKER_URL ?? "").replace(/\/+$/, "");
	if (!workerUrl) {
		throw new Error(
			`Missing EMAIL_WORKER_URL for the ${uploadTarget} upload (set it to the byzantini-website-emails worker URL).`,
		);
	}
	if (!process.env.SERVICE_AUTH_TOKEN) {
		throw new Error("Missing SERVICE_AUTH_TOKEN — the worker's token for template publishing.");
	}
	if (uploadTarget === "prod" && LOCAL_URL_PATTERN.test(workerUrl)) {
		throw new Error(
			`Refusing to publish --prod to the local URL ${workerUrl}.\n` +
				`EMAIL_WORKER_URL was read from ${envFile ?? "the environment"} — fix it before retrying.`,
		);
	}
	return { workerUrl, authToken: process.env.SERVICE_AUTH_TOKEN };
}

/**
 * Publishes built templates through the email worker's R2 binding
 * (`POST /html-templates` on byzantini-website-emails) — the CLI itself never
 * needs S3/R2 credentials. The worker writes the keys the site serves.
 */
async function publishToWorker(files: { key: string; path: string }[]) {
	const { workerUrl, authToken } = resolvePublishTarget();
	const res = await fetch(`${workerUrl}/html-templates`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			authToken,
			files: await Promise.all(
				files.map(async (file) => ({ key: file.key, content: await readFile(file.path, "utf8") })),
			),
		}),
	});
	if (!res.ok) throw new Error(`Template upload failed (${res.status}): ${await res.text()}`);
	console.log(`Uploaded ${files.length} file(s) via ${workerUrl} (${uploadTarget})`);
}

const produced: { key: string; path: string }[] = [];

for (const t of templates) {
	const html = await render(t.build(), { pretty: true });
	const target = path.join(templatesDir, t.name);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, html, "utf8");
	produced.push({ key: `html_templates/${t.name}`, path: target });
	console.log(`Wrote  ${path.relative(process.cwd(), target)} (${html.length} bytes)`);

	if (bucketTemplatesDir) {
		const bucketTarget = path.join(bucketTemplatesDir, t.name);
		await mkdir(path.dirname(bucketTarget), { recursive: true });
		await writeFile(bucketTarget, await readFile(target, "utf8"));
		console.log(`Synced ${path.join("bucket/latest/html_templates", t.name)}`);
	}
}

/**
 * SMS bodies: the same React Email components, rendered to plain text instead
 * of HTML and written to sms_templates/, where the campaign CLI reads them.
 *
 * Deliberately NOT published to R2: the website serves emails to mail clients,
 * and nothing outside this repo ever needs an SMS body.
 */
const smsDir = path.resolve(import.meta.dir, "../sms_templates");
const smsReport: { name: string; count: number; encoding: string; characters: number }[] = [];

for (const t of smsTemplates) {
	const text = await render(t.build(), { plainText: true });
	const target = path.join(smsDir, t.name);
	await mkdir(path.dirname(target), { recursive: true });
	// A trailing newline makes the artefact a well-formed text file (so `git diff`
	// and `wc -l` behave, and editors do not warn); renderSmsText trims it back off
	// before sending, so it never reaches a recipient.
	await writeFile(target, `${text}\n`, "utf8");
	const segments = estimateSegments(text);
	smsReport.push({ name: t.name, ...segments });
	// Greek is UCS-2, so the segment count IS the cost story — print it beside
	// every file so an over-long edit shows up here rather than mid-campaign.
	console.log(
		`Wrote  ${path.relative(process.cwd(), target)} (${segments.count} segment(s), ${segments.characters} ${segments.encoding} chars)`,
	);
}

if (smsReport.length > 0) {
	const worst = smsReport.reduce((a, b) => (b.count > a.count ? b : a));
	console.log(`SMS bodies: ${smsReport.length} built; largest is ${worst.count} segment(s) (${worst.name}).`);
	if (worst.count > SMS_HARD_CAP) {
		console.warn(
			`WARNING: Bird rejects a body above ${SMS_HARD_CAP} segments — shorten ${worst.name} (or split the campaign).`,
		);
	}
}

if (uploadTarget && dryRun) {
	const { workerUrl } = resolvePublishTarget();
	console.log(
		`\n[dry-run] would publish ${produced.length} file(s) to ${workerUrl}/html-templates (${uploadTarget}, ${envFile}).`,
	);
} else if (uploadTarget) {
	await publishToWorker(produced);
	console.log(`\nDone — ${produced.length} template(s) published via the email worker (${uploadTarget}).`);
}

if (!bucketTemplatesDir && !uploadTarget) {
	console.log("\nTip: set PROJECT_ABSOLUTE_PATH in the env file to also sync to bucket/latest/html_templates/.");
}
if (!uploadTarget) {
	console.log("\nTip: add --prod (or --dev) to upload the built templates to the R2 bucket.");
}

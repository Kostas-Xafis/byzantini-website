import { runErrorDigest } from "./errorDigest";
import { logRequest, toErrorMessage, NONE, type RequestOutcome } from "./observability";

export interface Env {
	/** R2 bucket (byzantini-bucket) — template publishing AND per-send template reads. */
	BUCKET: R2Bucket;
	/** MailerSend API key (secret via `wrangler secret put`). */
	MAILERSEND_API_KEY?: string;
	/** Shared secret the website sends as `authToken` in the request body. */
	SERVICE_AUTH_TOKEN?: string;
	/**
	 * Legacy local override. `true` forces a dry run, `false` forces a real send.
	 * When unset, the mode is derived per request by `decideDryRun()` — a local
	 * (`wrangler dev`) request never sends.
	 */
	DRY_RUN?: string;
	/** Overrides the per-request inference of `decideDryRun()` when set. */
	ENVIRONMENT?: string;
	/**
	 * Analytics Engine dataset for lite request telemetry (see observability.ts).
	 * Optional so the worker still runs if the binding is unavailable.
	 */
	ANALYTICS?: AnalyticsEngineDataset;
	/**
	 * The website's D1 database (byzantini-db) — read by the «Σφάλματα» digest cron only (`sys_errors`,
	 * `sys_users`). Optional so `fetch` keeps working where the binding is absent.
	 */
	DB?: D1Database;
}

interface MailRequest {
	authToken?: string;
	to?: string;
	subject?: string;
	htmlTemplateName?: string;
	templateData?: Record<string, string | number | undefined>;
}

interface TemplateUpload {
	authToken?: string;
	files?: { key?: string; content?: string }[];
}

const SENDER_EMAIL = "no-reply@musicschool-metamorfosi.gr";
const SENDER_NAME = "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής";
// Only filename-ish template names (fixed internal templates, no path traversal).
const TEMPLATE_NAME_PATTERN = /^[a-zA-Z0-9_./-]+$/;
const TEMPLATE_FILE_KEY_PATTERN = /^html_templates\/[a-zA-Z0-9_./-]+$/;
const MAX_TEMPLATE_FILES = 200;
const MAX_TEMPLATE_BYTES = 512 * 1024;

/** Request details gathered while handling, recorded in the telemetry line. */
interface RequestMeta {
	endpoint: string;
	template: string;
	count: number;
}

/** A handled request: the response, plus how it should be recorded. */
interface HandledRequest {
	response: Response;
	outcome: RequestOutcome;
	/** Short, non-sensitive failure reason (defaults to `NONE`). */
	error?: string;
}

export default {
	async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: Env): Promise<Response> {
		const startedAt = Date.now();
		// Correlates the response, the log line and the Analytics Engine point.
		const requestId = crypto.randomUUID();
		const meta: RequestMeta = { endpoint: NONE, template: NONE, count: 0 };

		let handled: HandledRequest;
		try {
			handled = await handleRequest(request, env, meta);
		} catch (e) {
			// Unexpected failure (for example an R2 error while publishing
			// templates): keep the 500 contract the worker had before
			// observability, but make sure it is recorded.
			console.error("Unhandled error while handling email request", { requestId, error: e });
			handled = {
				response: new Response("Internal service error", { status: 500 }),
				outcome: "error",
				error: toErrorMessage(e),
			};
		}

		logRequest(env, {
			requestId,
			outcome: handled.outcome,
			status: handled.response.status,
			durationMs: Date.now() - startedAt,
			endpoint: meta.endpoint,
			template: meta.template,
			count: meta.count,
			colo: request.cf?.colo ?? NONE,
			error: handled.error ?? NONE,
		});

		// Re-wrap so a response can be correlated with its log line. The body
		// stream passes through untouched (no buffering).
		const headers = new Headers(handled.response.headers);
		headers.set("X-Request-Id", requestId);
		return new Response(handled.response.body, {
			status: handled.response.status,
			statusText: handled.response.statusText,
			headers,
		});
	},
	/** Cron (wrangler.jsonc `triggers`): emails the sysadmins new server errors — see errorDigest.ts. */
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		if (!env.DB) {
			console.warn("[errors] no DB binding — digest skipped");
			return;
		}
		// No request to judge by: a dry run only when the environment says so or there is no API key
		// (`wrangler dev` reads ENVIRONMENT=development from .dev.vars).
		const dryRun = decideDryRun(env);
		ctx.waitUntil(
			runErrorDigest(env.DB, (email) => deliverEmail(env, email, dryRun)).catch((error) =>
				console.error("[errors] digest failed", error),
			),
		);
	},
} satisfies ExportedHandler<Env>;

async function handleRequest(request: Request, env: Env, meta: RequestMeta): Promise<HandledRequest> {
	if (request.method !== "POST")
		return {
			response: new Response("Invalid request. This service accepts only POST requests", { status: 400 }),
			outcome: "bad_request",
			error: "method_not_post",
		};

	if (!env.SERVICE_AUTH_TOKEN)
		return {
			response: new Response("Internal service error", { status: 500 }),
			outcome: "error",
			error: "auth_token_not_configured",
		};

	const pathname = new URL(request.url).pathname;

	// Template publishing (used by `templates:build --prod/--dev` on the CLI):
	// the worker holds the R2 binding, so the CLI never needs S3 credentials.
	if (pathname === "/html-templates") {
		meta.endpoint = "templates";
		const body = (await request.json().catch(() => null)) as TemplateUpload | null;
		if (!body)
			return {
				response: new Response("Malformed request, please check the request body.", { status: 400 }),
				outcome: "bad_request",
				error: "malformed_body",
			};

		const valid = await constantTimeEqual(body.authToken ?? "", env.SERVICE_AUTH_TOKEN);
		if (!valid)
			return {
				response: new Response("Invalid authentication token", { status: 401 }),
				outcome: "unauthorized",
				error: "invalid_token",
			};

		meta.count = body.files?.length ?? 0;
		const response = await handleTemplateUpload(env, body);
		if (response.ok) return { response, outcome: "ok" };
		// Validation rejections (no files / too many / bad entry / too large) are
		// short plain-text responses — capture the reason for the log line.
		return { response, outcome: "bad_request", error: await response.clone().text() };
	}

	// Transactional email send (the main endpoint).
	meta.endpoint = "send";
	const body = (await request.json().catch(() => null)) as MailRequest | null;
	if (!body)
		return {
			response: new Response("Malformed request, please check the request body.", { status: 400 }),
			outcome: "bad_request",
			error: "malformed_body",
		};

	// Template name only — never the recipient or the subject (see observability.ts).
	meta.template = body.htmlTemplateName ?? NONE;

	try {
		await mailService(body, env, request);
		meta.count = 1;
		return { response: new Response("Success", { status: 200 }), outcome: "ok" };
	} catch (e) {
		if (e instanceof Error && e.message === "Invalid authentication token")
			return {
				response: new Response("Invalid authentication token", { status: 401 }),
				outcome: "unauthorized",
				error: "invalid_token",
			};
		console.error("Email send failed:", e);
		return {
			response: new Response(`Failed request: ${e}`, { status: 400 }),
			outcome: "error",
			error: toErrorMessage(e),
		};
	}
}

/** Writes built html_templates into the R2 bucket (keys `html_templates/<name>`). */
async function handleTemplateUpload(env: Env, body: TemplateUpload): Promise<Response> {
	const files = body.files ?? [];
	if (files.length === 0) return new Response("No files provided", { status: 400 });
	if (files.length > MAX_TEMPLATE_FILES) return new Response("Too many files", { status: 400 });

	for (const file of files) {
		if (
			!file.key ||
			!TEMPLATE_FILE_KEY_PATTERN.test(file.key) ||
			file.key.includes("..") ||
			typeof file.content !== "string"
		) {
			return new Response(`Invalid file entry: ${file.key}`, { status: 400 });
		}
		const bytes = new TextEncoder().encode(file.content).byteLength;
		if (bytes > MAX_TEMPLATE_BYTES) return new Response(`Template too large: ${file.key}`, { status: 400 });
	}

	await Promise.all(
		files.map((file) =>
			env.BUCKET.put(file.key!, file.content!, {
				httpMetadata: { contentType: "text/html; charset=utf-8" },
			}),
		),
	);
	console.log(`[templates] uploaded ${files.length} file(s) to r2://byzantini-bucket/html_templates/`);
	return new Response(JSON.stringify({ uploaded: files.length }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

/** Renders the template and sends the email (mirrors email/src/mailserend.ts mailService). */
export async function mailService(body: MailRequest, env: Env, request?: Request): Promise<void> {
	const { authToken, to, subject, htmlTemplateName, templateData = {} } = body;

	if (!env.SERVICE_AUTH_TOKEN) throw new Error("No service auth token configured");
	const valid = await constantTimeEqual(authToken ?? "", env.SERVICE_AUTH_TOKEN);
	if (!valid) throw new Error("Invalid authentication token");

	if (!to) throw new Error("No recipient provided");
	if (!subject) throw new Error("No subject provided");
	if (!htmlTemplateName) throw new Error("No HTML template name provided");
	if (!TEMPLATE_NAME_PATTERN.test(htmlTemplateName) || htmlTemplateName.includes(".."))
		throw new Error(`Invalid HTML template name: ${htmlTemplateName}`);

	// Templates live in the same R2 bucket this worker publishes to
	// (`POST /html-templates`, keys `html_templates/<name>`). Read them from
	// the binding directly — no HTTP fetch from the website's file proxy.
	const html = await getHTMLTemplate(env, htmlTemplateName, templateData);

	await deliverEmail(env, { to, subject, html, label: htmlTemplateName }, decideDryRun(env, request));
}

/**
 * Sends one rendered email through MailerSend — or, in a dry run, only logs it (masked recipient, truncated HTML).
 * `label` names the email in the logs (the template name), never its content.
 */
export async function deliverEmail(
	env: Env,
	{ to, subject, html, label }: { to: string; subject: string; html: string; label: string },
	dryRun: { on: boolean; reason: string },
): Promise<void> {
	if (dryRun.on) {
		// A local (wrangler dev) request NEVER sends, whatever the site's
		// environment says. Real recipients are masked; the auth token is never
		// logged; the rendered HTML is truncated.
		console.log(`[dry-run:${dryRun.reason}] would send to=${maskEmail(to)} subject=${subject} template=${label} html=${html.length}b`);
		console.log(html.slice(0, 500));
		return;
	}

	if (!env.MAILERSEND_API_KEY) throw new Error("No MailerSend API key provided");

	const res = await fetch("https://api.mailersend.com/v1/email", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.MAILERSEND_API_KEY}`,
		},
		body: JSON.stringify({
			from: { email: SENDER_EMAIL, name: SENDER_NAME },
			to: [{ email: to }],
			reply_to: { email: SENDER_EMAIL, name: SENDER_NAME },
			subject,
			html,
		}),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(`MailerSend responded ${res.status}: ${detail.slice(0, 500)}`);
	}
	console.log(`[mail] to=${to} subject=${subject} template=${label}`);
}

/**
 * Whether this request must be a dry run (render + log, never send).
 *
 * The website calls this worker in EVERY environment now (it is the logging /
 * sanity-check path locally), so the decision lives here, next to the send.
 * It fails SAFE: anything that looks local is a dry run.
 *
 * Precedence:
 *  1. `DRY_RUN` — explicit override, wins in both directions.
 *  2. `ENVIRONMENT`/`CF_WORKER_ENV` = dev/development/local → dry run.
 *  3. no `MAILERSEND_API_KEY` → dry run (nothing to send with anyway, and
 *     failing here would only break the caller's flow).
 *  4. the request did not come through the Cloudflare edge (`CF-Connecting-IP`
 *     absent, or a localhost host) → `wrangler dev` → dry run.
 *  5. otherwise send for real (production).
 */
export function decideDryRun(env: Env, request?: Request): { on: boolean; reason: string } {
	if (env.DRY_RUN === "true") return { on: true, reason: "dry_run_var" };
	if (env.DRY_RUN === "false") return { on: false, reason: "dry_run_var" };
	if (env.DRY_RUN && env.DRY_RUN !== "true" && env.DRY_RUN !== "false")
		return { on: true, reason: "dry_run_unrecognised" };

	const declared = (env.ENVIRONMENT ?? "").toLowerCase();
	if (declared === "dev" || declared === "development" || declared === "local") return { on: true, reason: "declared_dev" };
	if (declared === "production" || declared === "prod") return { on: false, reason: "declared_prod" };

	if (!env.MAILERSEND_API_KEY) return { on: true, reason: "no_api_key" };

	if (request) {
		if (!request.headers.get("CF-Connecting-IP")) return { on: true, reason: "not_edge_request" };
		const host = new URL(request.url).hostname;
		if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost"))
			return { on: true, reason: "localhost_host" };
	}

	return { on: false, reason: "production" };
}

/**
 * Masks a recipient so dry-run logs stay useful without writing full personal
 * data into the logs: `kostas@example.com` → `ko***@example.com`.
 */
export function maskEmail(value: string): string {
	const at = value.lastIndexOf("@");
	if (at <= 0) return value.length <= 2 ? "***" : `${value.slice(0, 2)}***`;
	const local = value.slice(0, at);
	const domain = value.slice(at);
	const shown = local.slice(0, Math.min(2, local.length));
	return `${shown}***${domain}`;
}

const getHTMLTemplate = async (
	env: Env,
	name: string,
	data: Record<string, string | number | undefined>,
) => {
	const template = await env.BUCKET.get(`html_templates/${name}`);
	if (!template) throw new Error(`Could not find the HTML template (${name}) in the bucket.`);
	return applyToTemplate(await template.text(), data);
};

/** Template values are text, never markup: a submitted form field must not be able to inject HTML/links into a school email. */
const escapeHtml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const applyToTemplate = (template: string, data: Record<string, string | number | undefined>) => {
	const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
	return template.replace(regex, (_, match: string) => escapeHtml(String(data[match] ?? "")));
};

/** Constant-time-ish secret comparison via SHA-256 (no early exit on length/content). */
const constantTimeEqual = async (a: string, b: string): Promise<boolean> => {
	const enc = new TextEncoder();
	const [da, db] = await Promise.all([
		crypto.subtle.digest("SHA-256", enc.encode(a)),
		crypto.subtle.digest("SHA-256", enc.encode(b)),
	]);
	const ua = new Uint8Array(da);
	const ub = new Uint8Array(db);
	if (ua.length !== ub.length) return false;
	return ua.every((v, i) => v === ub[i]);
};

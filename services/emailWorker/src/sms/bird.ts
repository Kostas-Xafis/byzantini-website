import { maskPhone } from "./phone";
import { assertWithinSegments, estimateSegments } from "./segments";

/**
 * Bird (bird.com) SMS client for the campaign CLI.
 *
 * Why a hand-rolled client: the campaign tooling must stay runnable from this
 * repo with `bun src/cli.ts` and no new dependency, so this talks to Bird's REST
 * API directly with the global `fetch`. It is deliberately thin and fail-loud:
 * validate locally, refuse a body Bird would reject anyway (over the segment
 * cap), and surface Bird's structured error body as a {@link BirdApiError} so a
 * failed campaign row carries an actionable code instead of "HTTP 422".
 *
 * Security: the API key is read from the environment at call time and is only
 * ever placed in the Authorization header. It is never logged, never echoed in
 * an error message, and never copied into a returned object — Bird's own error
 * bodies and our synthetic dry-run bodies both exclude it.
 */

/** Why the message is being sent — Bird's `category`, which also picks the suppression rules. */
export type SmsCategory = "transactional" | "marketing" | "authentication" | "service";

export type SendSmsParams = {
	/** Single recipient in E.164, e.g. "+306912345678". Bird accepts exactly one. */
	to: string;
	/** Alphanumeric sender ID (3–11 ASCII chars) or an E.164 number the workspace owns. */
	from: string;
	/** Body; at least 1 character and at most `BIRD_MAX_SEGMENTS` (default 12) segments. */
	text: string;
	category: SmsCategory;
	/** Optional labels for Bird-side filtering; max 20, names 1–32 and values 1–64 ASCII [A-Za-z0-9_-]. */
	tags?: { name: string; value: string }[];
	/** Arbitrary JSON echoed back on reads and webhooks; Bird caps the serialized form at 2 KB. */
	metadata?: Record<string, unknown>;
	/** Bird's `options.smart_encoding` — transliterates characters to keep a body in GSM-7. */
	smartEncoding?: boolean;
	/** Makes a retried send replay the original result instead of delivering twice. */
	idempotencyKey?: string;
};

export type SendSmsResult = {
	id: string;
	status: string;
	to: string;
	from: string;
	segments: { count: number; encoding: string; characters: number } | null;
	/** True when the API answered 202 (or when a dry run stood in for a send). */
	accepted: boolean;
	dryRun: boolean;
	/** Bird's response body verbatim (or, on a dry run, the request that would have been sent). */
	raw: unknown;
};

/** Bird's documented region hosts. The region encoded in the API key must match the host. */
const DEFAULT_REGION = "eu1";

/** Bird's hard cap: a free-text body above 12 segments is rejected with a 422. */
const DEFAULT_MAX_SEGMENTS = 12;

const SMS_CATEGORIES: readonly SmsCategory[] = ["transactional", "marketing", "authentication", "service"];

/** 7–15 digits with a leading +, first digit non-zero — Bird requires E.164. */
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Keeps a non-JSON error page (a proxy 502, an HTML body) from flooding the operator's terminal. */
const MAX_ERROR_BODY_CHARS = 300;

/** Environment lookup shape: `process.env`, a Worker binding object, or a test double. */
type BirdEnv = Record<string, string | undefined>;

/**
 * A non-2xx answer from Bird, carrying the fields of Bird's error envelope
 * (`{ code, message, type, retryable, param?, request_id?, doc_url? }`).
 *
 * Why a class instead of `throw new Error(await res.text())`: the campaign runner
 * records a per-recipient failure reason, and a campaign operator needs to tell
 * "this number is malformed" (never retry) from "Bird is having a bad minute"
 * (retry later, and `Idempotency-Key` makes that safe).
 */
export class BirdApiError extends Error {
	/** HTTP status of the failed call (never 2xx). */
	status: number;
	/** Bird's machine-readable code, e.g. "E12020" for a country the workspace cannot send to. */
	code?: string;
	/** Bird's error class, when it sent one. */
	type?: string;
	/** The request field Bird blamed, when it named one (e.g. "to"). */
	param?: string;
	/** Bird's request id — quote it to Bird support. */
	requestId?: string;
	/** Link to the documentation page for this error. */
	docUrl?: string;
	/** True when retrying the identical request can succeed. */
	retryable: boolean;

	constructor(details: {
		status: number;
		code?: string;
		type?: string;
		param?: string;
		requestId?: string;
		docUrl?: string;
		retryable?: boolean;
		message?: string;
		remediation?: string;
	}) {
		let message = `Bird SMS API error ${details.status}`;
		if (details.code) message += ` (${details.code})`;
		if (details.message) message += `: ${details.message}`;
		if (details.param) message += ` [param: ${details.param}]`;
		if (details.requestId) message += ` [request_id: ${details.requestId}]`;
		// Bird usually ships operator guidance ("enable this country in the
		// dashboard") or a doc link — that is the part a human can act on.
		if (details.remediation) message += ` — ${details.remediation}`;
		else if (details.docUrl) message += ` — ${details.docUrl}`;
		super(message);

		this.name = "BirdApiError";
		this.status = details.status;
		this.code = details.code;
		this.type = details.type;
		this.param = details.param;
		this.requestId = details.requestId;
		this.docUrl = details.docUrl;
		// Fall back to the conventional retryable set when Bird did not say.
		this.retryable = details.retryable ?? (details.status === 429 || details.status >= 500);
	}
}

/**
 * The API host to call: an explicit `BIRD_API_URL` override wins, otherwise the
 * regional host derived from `BIRD_REGION` (default `eu1`).
 *
 * Why the override is validated eagerly: a typo in `BIRD_API_URL` otherwise
 * surfaces as a DNS failure in the middle of a send run, and a key from
 * `bk_eu1_…` cannot authenticate against the US host — so a bad base is a
 * configuration bug worth failing on before the first message goes out.
 */
export function resolveBirdApiBase(env?: BirdEnv): string {
	const resolved = readEnv(env);
	const override = resolved.BIRD_API_URL?.trim();
	if (override) {
		let parsed: URL;
		try {
			parsed = new URL(override);
		} catch {
			throw new Error(`BIRD_API_URL is not a valid URL: "${override}". Expected e.g. https://eu1.platform.bird.com.`);
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new Error(`BIRD_API_URL must be an http(s) URL, got "${override}".`);
		}
		return override.replace(/\/+$/, "");
	}
	const region = resolved.BIRD_REGION?.trim() || DEFAULT_REGION;
	return `https://${region}.platform.bird.com`;
}

/**
 * Whether a send should be simulated instead of performed.
 *
 * Two independent triggers, both meaning "do not touch the network": an explicit
 * `BIRD_DRY_RUN` (`"true"` / `"1"`), or a missing `BIRD_API_KEY` — the CLI is
 * routinely run without send credentials, and a missing key must never be the
 * thing that turns a preview into a real, billed SMS blast.
 */
export function isSmsDryRun(env?: BirdEnv): boolean {
	const resolved = readEnv(env);
	const flag = resolved.BIRD_DRY_RUN?.trim().toLowerCase();
	if (flag === "true" || flag === "1") return true;
	return !resolved.BIRD_API_KEY?.trim();
}

/**
 * Sends exactly one SMS through Bird and maps the 202 response.
 *
 * In dry-run mode (see {@link isSmsDryRun}) nothing is transmitted: one summary
 * line is logged and a synthetic, `dryRun: true` result is returned, so callers
 * can exercise a whole campaign — pacing, per-recipient checks, state files —
 * without spending credit. The body is still validated and measured first, which
 * is the point: a dry run must catch an over-long or malformed body.
 *
 * Only Bird's documented fields are ever sent, and the request body is built by
 * whitelist rather than by spreading caller input, because Bird rejects the
 * reserved fields (`scheduled_at`, `media_urls`, `messaging_profile_id`, …) with
 * `422 SMSUnsupportedFeature` and a stray key would fail the whole send.
 */
export async function sendSms(params: SendSmsParams, env?: BirdEnv): Promise<SendSmsResult> {
	const resolved = readEnv(env);
	validateSendSmsParams(params);

	// Refused locally so an over-long body fails as a clear local error rather
	// than as a Bird 422 in the middle of a run. Bird never truncates.
	assertWithinSegments(params.text, resolveMaxSegments(resolved));

	const url = `${resolveBirdApiBase(resolved)}/v1/sms/messages`;
	const body = buildRequestBody(params);
	const segments = estimateSegments(params.text);

	if (isSmsDryRun(resolved)) {
		// The recipient is masked even here: a terminal log is exactly the kind of
		// output that gets pasted into a chat, and a campaign's worth of phone
		// numbers is personal data this repo has committed to keeping out of logs.
		console.log(
			`[sms:dry-run] to=${maskPhone(params.to)} from=${params.from} segments=${segments.count} chars=${segments.characters} encoding=${segments.encoding}`,
		);
		return {
			id: "dry-run",
			status: "dry-run",
			to: params.to,
			from: params.from,
			segments: { count: segments.count, encoding: segments.encoding, characters: segments.characters },
			accepted: true,
			dryRun: true,
			raw: { dryRun: true, request: { method: "POST", url, body } },
		};
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${requireApiKey(resolved)}`,
		"Content-Type": "application/json",
	};
	if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;

	const response = await requestBird(url, { method: "POST", headers, body: JSON.stringify(body) });
	const raw = await readResponseBody(response);
	if (!response.ok) throw toBirdApiError(response, raw);
	return mapSuccess(response, raw, params);
}

/**
 * Reads one message back by id — the polling half of a send, used to reconcile
 * delivery and cost after a campaign run.
 *
 * A read is side-effect free, so `BIRD_DRY_RUN` does not apply here; a missing
 * API key is a hard error instead, because a silent "no status" would look like
 * a delivery problem when it is really a configuration one.
 */
export async function getSmsStatus(messageId: string, env?: BirdEnv): Promise<unknown> {
	const resolved = readEnv(env);
	if (!messageId?.trim()) {
		throw new Error("No SMS message id provided — pass the `id` from a sendSms result.");
	}
	const url = `${resolveBirdApiBase(resolved)}/v1/sms/messages/${encodeURIComponent(messageId)}`;
	const headers: Record<string, string> = {
		Authorization: `Bearer ${requireApiKey(resolved)}`,
		Accept: "application/json",
	};

	const response = await requestBird(url, { method: "GET", headers });
	const raw = await readResponseBody(response);
	if (!response.ok) throw toBirdApiError(response, raw);
	return raw;
}

function readEnv(env?: BirdEnv): BirdEnv {
	return env ?? process.env;
}

/** Resolves the credential without ever putting it in a message. */
function requireApiKey(env: BirdEnv): string {
	const key = env.BIRD_API_KEY?.trim();
	if (!key) throw new Error("No Bird API key provided — set BIRD_API_KEY (or BIRD_DRY_RUN=true to preview without sending).");
	return key;
}

/**
 * The pre-flight cap: Bird's 12 segments by default, lowered (or set per
 * workspace) with `BIRD_MAX_SEGMENTS`. A junk value falls back to the default
 * with a warning rather than disabling the check — refusing too much is safe,
 * silently sending a 40-segment body is not.
 */
function resolveMaxSegments(env: BirdEnv): number {
	const raw = env.BIRD_MAX_SEGMENTS?.trim();
	if (!raw) return DEFAULT_MAX_SEGMENTS;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) {
		console.warn(`Ignoring invalid BIRD_MAX_SEGMENTS="${raw}" — using the default of ${DEFAULT_MAX_SEGMENTS}.`);
		return DEFAULT_MAX_SEGMENTS;
	}
	return parsed;
}

/**
 * Rejects the four inputs Bird would reject anyway, but with a message that
 * names the offending value — a campaign run should fail on row 1 with "invalid
 * recipient", not 200 times with a generic 422.
 */
function validateSendSmsParams(params: SendSmsParams): void {
	if (!E164_PATTERN.test(params.to)) {
		// Masked like every other mention of a recipient: this message is printed
		// verbatim by the campaign runner's per-recipient failure line, and the
		// repo's logging promise is that no full number reaches a log.
		throw new Error(`Invalid SMS recipient "${maskPhone(params.to)}" — expected E.164 with country code, e.g. +306912345678.`);
	}
	if (!params.from || params.from.trim().length === 0) {
		throw new Error("No SMS sender provided — pass an alphanumeric sender ID (3–11 characters) or an E.164 number the Bird workspace owns.");
	}
	if (!params.text || params.text.length < 1) {
		throw new Error("No SMS body provided — Bird requires at least 1 character and never sends an empty message.");
	}
	if (!SMS_CATEGORIES.includes(params.category)) {
		throw new Error(`Invalid SMS category "${params.category}" — expected one of ${SMS_CATEGORIES.join(", ")}.`);
	}
}

/**
 * Builds the request body explicitly, field by field.
 *
 * Why not spread `params`: Bird answers `422 SMSUnsupportedFeature` for its
 * reserved fields (`scheduled_at`, `validity_period`, `media_urls`,
 * `messaging_profile_id`, `broadcast_id`, `campaign_id`, `audience_id`,
 * `contact_id`, `topic_id`, `personalization`, `options.max_price_per_segment`,
 * `options.track_clicks`). A whitelist makes it impossible for a caller — or a
 * future refactor — to send one by accident. `options` carries `smart_encoding`
 * and nothing else, because that is the only option Bird supports.
 */
function buildRequestBody(params: SendSmsParams): Record<string, unknown> {
	const body: Record<string, unknown> = {
		to: params.to,
		from: params.from,
		text: params.text,
		category: params.category,
	};
	if (params.tags && params.tags.length > 0) body.tags = params.tags.map((tag) => ({ name: tag.name, value: tag.value }));
	if (params.metadata && Object.keys(params.metadata).length > 0) body.metadata = params.metadata;
	if (params.smartEncoding !== undefined) body.options = { smart_encoding: params.smartEncoding };
	return body;
}

/**
 * One place where the network is touched, so an unreachable host or a TLS
 * failure still arrives as an Error naming the URL. The init carries the
 * Authorization header and is never echoed.
 */
async function requestBird(url: string, init: RequestInit): Promise<Response> {
	try {
		return await fetch(url, init);
	} catch (e) {
		throw new Error(`Could not reach the Bird SMS API at ${url}: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/** Parses a response body, tolerating the non-JSON pages proxies and gateways return. */
async function readResponseBody(response: Response): Promise<unknown> {
	const text = await response.text().catch(() => "");
	if (!text.trim()) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text.trim().slice(0, MAX_ERROR_BODY_CHARS);
	}
}

/** Turns Bird's error envelope into a {@link BirdApiError}, keeping whatever it actually sent. */
function toBirdApiError(response: Response, raw: unknown): BirdApiError {
	const body = isRecord(raw) ? raw : {};
	const status = response.status;
	return new BirdApiError({
		status,
		code: asString(body.code),
		type: asString(body.type),
		param: asString(body.param),
		requestId: asString(body.request_id),
		docUrl: asString(body.doc_url),
		retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
		// Fall back to the status text (or a truncated non-JSON body) so the
		// message is never bare "error 422".
		message: asString(body.message) ?? asString(raw) ?? response.statusText,
		remediation: asString(body.remediation),
	});
}

/** Maps the 202 body into the caller-facing shape. */
function mapSuccess(response: Response, raw: unknown, params: SendSmsParams): SendSmsResult {
	const body = isRecord(raw) ? raw : {};
	return {
		// A 202 without an id should not happen. Returning an empty id beats
		// throwing: the message WAS accepted, and a throw here would push the
		// caller into retrying an SMS that already went out.
		id: asString(body.id) ?? "",
		status: asString(body.status) ?? "accepted",
		to: asString(body.to) ?? params.to,
		from: asString(body.from) ?? params.from,
		segments: mapSegments(body.segments),
		accepted: response.status === 202,
		dryRun: false,
		raw,
	};
}

/** Bird's `segments` object, or null when the response did not carry a usable one. */
function mapSegments(value: unknown): SendSmsResult["segments"] {
	if (!isRecord(value)) return null;
	const { count, characters, encoding } = value;
	if (typeof count !== "number" || typeof characters !== "number" || typeof encoding !== "string") return null;
	return { count, encoding, characters };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

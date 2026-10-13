/**
 * Lite request observability for the PDF worker.
 *
 * Every request produces:
 *   1. one Analytics Engine data point (`env.ANALYTICS`) — queryable with the
 *      Workers Analytics Engine SQL API, and
 *   2. one structured JSON line through `console` — picked up by Workers Logs
 *      and correlated with traces through the `X-Request-Id` response header.
 *
 * Deliberately metadata only. Request bodies contain personal data (names,
 * emails, phone numbers, AMKA, addresses) and are never recorded here — no
 * body, no `Authorization` header, no template contents.
 */

/** Minimal slice of `Env` this module needs — keeps it decoupled from index.ts. */
export interface ObservabilityEnv {
	/**
	 * Analytics Engine dataset binding. Optional so the worker still runs when
	 * the binding is absent (local dev without config, older deployments).
	 */
	ANALYTICS?: AnalyticsEngineDataset;
}

export type RequestOutcome = "ok" | "bad_request" | "unauthorized" | "error";

export interface RequestLog {
	/** Correlates the log line, the data point and the `X-Request-Id` header. */
	requestId: string;
	outcome: RequestOutcome;
	/** HTTP status returned to the caller. */
	status: number;
	/** Wall-clock handling time in milliseconds. */
	durationMs: number;
	/** Body `type` when it could be parsed, `-` otherwise. */
	requestType: string;
	/** `single` | `multiple` for registration requests, `-` otherwise. */
	mode: string;
	/** Number of registrations rendered (0 when unknown). */
	count: number;
	/** Cloudflare colo that served the request, `-` when unavailable. */
	colo: string;
	/** Short, non-sensitive failure reason; `-` when the request succeeded. */
	error: string;
}

/** Placeholder for "no value" — Analytics Engine blobs cannot be empty strings. */
export const NONE = "-";

/** Analytics Engine blob fields are length-capped; keep them short and flat. */
const MAX_FIELD_LENGTH = 240;

const truncate = (value: string): string => {
	const oneLine = value.replace(/\s+/g, " ").trim();
	if (!oneLine) return NONE;
	return oneLine.length > MAX_FIELD_LENGTH ? `${oneLine.slice(0, MAX_FIELD_LENGTH - 1)}…` : oneLine;
};

/**
 * Records one request. Best-effort by design: telemetry must never change the
 * response a caller receives, so both halves are individually guarded.
 */
export const logRequest = (env: ObservabilityEnv, entry: RequestLog): void => {
	const durationMs = Math.round(entry.durationMs);
	const error = truncate(entry.error);
	const requestType = truncate(entry.requestType);
	const mode = truncate(entry.mode);
	const colo = truncate(entry.colo);

	try {
		const line = JSON.stringify({
			event: "pdf_request",
			requestId: entry.requestId,
			outcome: entry.outcome,
			status: entry.status,
			durationMs,
			type: requestType,
			mode,
			count: entry.count,
			colo,
			// Only present on failures, so successful lines stay compact.
			error: error === NONE ? undefined : error,
		});
		if (entry.outcome === "ok") console.log(line);
		else console.warn(line);
	} catch {
		// Never let logging break the response.
	}

	try {
		// Fire-and-forget: the runtime flushes data points in the background,
		// so there is nothing to await here.
		env.ANALYTICS?.writeDataPoint({
			// Single low-cardinality index — the sampling/grouping key used by WAE.
			indexes: [entry.outcome],
			blobs: [entry.outcome, requestType, mode, entry.requestId, colo, error],
			doubles: [durationMs, entry.status, entry.count],
		});
	} catch {
		// Telemetry is optional; a missing/unavailable dataset must not fail a request.
	}
};

/** Safe, single-line description of a thrown value. */
export const toErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message || error.name;
	if (typeof error === "string") return error;
	try {
		return String(error);
	} catch {
		return "unknown_error";
	}
};

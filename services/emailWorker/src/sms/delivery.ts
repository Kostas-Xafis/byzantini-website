import { BirdApiError, resolveBirdApiBase } from "./bird";

/**
 * Carrier-confirmed SMS delivery statistics for one campaign tag.
 *
 * The local campaign state knows only what this CLI handed to Bird — not
 * whether a handset ever received it. Bird's `GET /v1/sms/stats/tags` is the
 * only source of delivery truth, and because every send carries the tag
 * `campaign:<id>` (see the runner's `tags`), a single call answers "how did
 * this campaign actually land?" without walking message by message.
 *
 * A read is side-effect free, so `BIRD_DRY_RUN` deliberately does NOT apply
 * here: refusing to show statistics during a dry run would be actively
 * unhelpful. A missing API key is a hard error instead, because silently
 * reporting "no data" would look like a delivery problem when it is really a
 * configuration one.
 */

/** One latency family's percentiles, in milliseconds. Any of them may be null. */
export type SmsLatencyPercentiles = { p50: number | null; p95: number | null; p99: number | null };

/** Bird's delivery figures for a single tag over a period. */
export type SmsDeliveryStats = {
	/** The tag row these figures came from, e.g. "campaign:renew-2026". */
	tag: string;
	period: { from: string; to: string; dataAsOf: string | null };
	accepted: number;
	sent: number;
	delivered: number;
	undelivered: number;
	failed: number;
	rejected: number;
	expired: number;
	/** delivered / accepted; null when nothing was accepted in the window. */
	deliveryRate: number | null;
	/** (undelivered + failed + expired) / accepted; null when nothing was accepted. */
	failureRate: number | null;
	/** End-to-end latency percentiles. */
	latency: SmsLatencyPercentiles;
	/** Per-day delivery counts. Sparse: only days with activity appear. */
	trend: { bucket: string; accepted: number; delivered: number; failed: number }[];
};

type StatsEnv = Record<string, string | undefined>;

export type SmsStatsOptions = {
	/** How many days back to look. Ignored when `from` is given. Default 30. */
	days?: number;
	/** Inclusive start day, YYYY-MM-DD. */
	from?: string;
	/** Inclusive end day, YYYY-MM-DD. Defaults to today. */
	to?: string;
	/**
	 * IANA zone for day boundaries. The school is in Athens, so a "day" in the
	 * report means the operator's day rather than a UTC one — which is also why
	 * the local state aggregates by local calendar day.
	 */
	timezone?: string;
	env?: StatsEnv;
};

/**
 * `include_trend` requires limit ≤ 50, but a workspace with many tags might not
 * rank this campaign inside the top 50. So the first call asks for the trend
 * and, only if the tag is missing, a second call widens the net without it.
 * One extra request on a miss beats either losing the trend always or losing
 * the row on a busy workspace.
 */
const TREND_LIMIT = 50;
const WIDE_LIMIT = 200;

/** Bird's cap on the period a stats request may span. */
const MAX_WINDOW_DAYS = 365;

function ymd(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Reads delivery statistics for `tag`, or null when Bird has no row for it yet. */
export async function getSmsStatsByTag(tag: string, options: SmsStatsOptions = {}): Promise<SmsDeliveryStats | null> {
	const env = options.env ?? process.env;
	const apiKey = env.BIRD_API_KEY?.trim();
	if (!apiKey) {
		throw new Error("No Bird API key provided — set BIRD_API_KEY to read SMS delivery statistics.");
	}
	const base = resolveBirdApiBase(env);
	const timezone = options.timezone ?? "Europe/Athens";
	const to = options.to ?? ymd(new Date());
	const days = Math.min(Math.max(options.days ?? 30, 1), MAX_WINDOW_DAYS);
	const from = options.from ?? ymd(new Date(Date.now() - (days - 1) * 86_400_000));

	const withTrend = await fetchTagRows(base, apiKey, { from, to, timezone, limit: TREND_LIMIT, includeTrend: true });
	const trendRow = findTag(withTrend.rows, tag);
	if (trendRow) return mapDeliveryStats(trendRow, withTrend.period);

	// Not in the trend-ranked window: ask for a wider ranking, without the trend,
	// so a busy workspace still gets its numbers.
	const wide = await fetchTagRows(base, apiKey, { from, to, timezone, limit: WIDE_LIMIT, includeTrend: false });
	const wideRow = findTag(wide.rows, tag);
	return wideRow ? mapDeliveryStats(wideRow, wide.period) : null;
}

type StatsPeriod = { from: string; to: string; dataAsOf: string | null };

async function fetchTagRows(
	base: string,
	apiKey: string,
	query: { from: string; to: string; timezone: string; limit: number; includeTrend: boolean },
): Promise<{ rows: Record<string, unknown>[]; period: StatsPeriod }> {
	const params = new URLSearchParams({
		from: query.from,
		to: query.to,
		timezone: query.timezone,
		limit: String(query.limit),
		sort: "accepted",
	});
	if (query.includeTrend) {
		params.set("include_trend", "true");
		params.set("trend_grain", "daily");
	}

	const url = `${base}/v1/sms/stats/tags?${params.toString()}`;
	let response: Response;
	try {
		response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
	} catch (e) {
		throw new Error(`Could not reach the Bird SMS API at ${base}: ${e instanceof Error ? e.message : String(e)}`);
	}

	const text = await response.text().catch(() => "");
	let raw: unknown = null;
	if (text.trim()) {
		try {
			raw = JSON.parse(text) as unknown;
		} catch {
			raw = text.trim().slice(0, 300);
		}
	}
	if (!response.ok) {
		const body = isRecord(raw) ? raw : {};
		throw new BirdApiError({
			status: response.status,
			code: asString(body.code),
			type: asString(body.type),
			param: asString(body.param),
			requestId: asString(body.request_id),
			docUrl: asString(body.doc_url),
			retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
			message: asString(body.message) ?? asString(raw) ?? response.statusText,
			remediation: asString(body.remediation),
		});
	}

	const body = isRecord(raw) ? raw : {};
	const rows = Array.isArray(body.data) ? body.data.filter(isRecord) : [];
	const rawPeriod = isRecord(body.period) ? body.period : {};
	return {
		rows,
		period: {
			from: asString(rawPeriod.from) ?? query.from,
			to: asString(rawPeriod.to) ?? query.to,
			dataAsOf: asString(rawPeriod.data_as_of) ?? null,
		},
	};
}

function findTag(rows: Record<string, unknown>[], tag: string): Record<string, unknown> | null {
	return rows.find((row) => asString(row.tag) === tag) ?? null;
}

/** Maps one Bird tag row into the shape the report renders. Tolerates missing parts. */
function mapDeliveryStats(row: Record<string, unknown>, period: StatsPeriod): SmsDeliveryStats {
	const delivery = isRecord(row.delivery) ? row.delivery : {};
	const latency = isRecord(row.latency) ? row.latency : {};
	const total = isRecord(latency.total) ? latency.total : {};
	const trend = Array.isArray(row.trend) ? row.trend.filter(isRecord) : [];

	return {
		tag: asString(row.tag) ?? "",
		period,
		accepted: asNumber(delivery.accepted),
		sent: asNumber(delivery.sent),
		delivered: asNumber(delivery.delivered),
		undelivered: asNumber(delivery.undelivered),
		failed: asNumber(delivery.failed),
		rejected: asNumber(delivery.rejected),
		expired: asNumber(delivery.expired),
		deliveryRate: asNumberOrNull(delivery.delivery_rate),
		failureRate: asNumberOrNull(delivery.failure_rate),
		latency: {
			p50: asNumberOrNull(total.p50_ms),
			p95: asNumberOrNull(total.p95_ms),
			p99: asNumberOrNull(total.p99_ms),
		},
		trend: trend.map((point) => {
			const pointDelivery = isRecord(point.delivery) ? point.delivery : {};
			return {
				bucket: asString(point.bucket) ?? "",
				accepted: asNumber(pointDelivery.accepted),
				delivered: asNumber(pointDelivery.delivered),
				failed: asNumber(pointDelivery.failed),
			};
		}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

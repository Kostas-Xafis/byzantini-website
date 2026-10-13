import { campaigns } from "./campaigns";
import { listStateFiles, loadState, recordKey, type CampaignState } from "./state";
import type { CampaignChannel } from "./types";
import type { SmsDeliveryStats } from "../sms/delivery";

/**
 * Campaign statistics, derived from the CLI's own state files.
 *
 * Why local state and not a provider API for the base numbers: the state files
 * are the only place that knows what THIS tool actually did. MailerSend cannot
 * be asked "which of these 2,365 addresses did you accept", and a provider
 * dashboard counts everything sent from the domain, including transactional
 * mail from the Worker. So the counts here are exactly the campaign's own
 * sends, available offline, and they cover both channels the same way.
 *
 * Delivery truth (did the carrier hand it to the handset?) can only come from
 * the provider, which is what `SmsDeliveryStats` adds for SMS on request.
 */

/** One local calendar day of activity, oldest first in a series. */
export type DailyPoint = {
	/** Local calendar day, YYYY-MM-DD. */
	day: string;
	sent: number;
	/** Failure records, not distinct recipients — a retried failure counts twice. */
	failed: number;
};

/** One channel's activity for one campaign. */
export type ChannelStats = {
	channel: CampaignChannel;
	/** Distinct recipients successfully sent, all time. */
	sent: number;
	/** Distinct recipients with at least one failure on record. */
	failed: number;
	/** Raw failure records; exceeds `failed` when a recipient failed repeatedly. */
	failureAttempts: number;
	sentToday: number;
	sentInWindow: number;
	firstSentAt: string | null;
	lastSentAt: string | null;
	/** One entry per day in the window, gaps filled with zeros so a chart is continuous. */
	daily: DailyPoint[];
};

/**
 * Bird's carrier-confirmed delivery figures for one campaign's SMS.
 *
 * Defined by the Bird client that fetches them (src/sms/delivery.ts) and
 * re-exported here so the report and its renderer have a single import site for
 * reporting types. This is the one part of the report that cannot be derived
 * from local state: whether a handset actually received the message is only
 * knowable from the carrier.
 */
export type { SmsDeliveryStats };

/** How many recipients the campaign would reach right now (`--live`). */
export type AudienceStats = {
	email: number | null;
	sms: number | null;
	/** Recipients dropped from the SMS audience for want of a usable mobile. */
	smsSkipped: number | null;
};

export type CampaignStats = {
	campaignId: string;
	/** Registry title, or the id when the campaign definition no longer exists. */
	title: string;
	/** Channels the campaign is CONFIGURED for, which may exceed the channels it has run on. */
	configuredChannels: CampaignChannel[];
	/** Channels with recorded activity, strongest first. */
	channels: ChannelStats[];
	totalSent: number;
	totalFailed: number;
	firstSentAt: string | null;
	lastSentAt: string | null;
	/** Present only with `--live` (and only for campaigns still in the registry). */
	audience?: AudienceStats;
	/** Present only with `--delivery`. Null when Bird had no rows for the tag. */
	delivery?: SmsDeliveryStats | null;
	/** Set when `--delivery` was asked for but Bird could not answer. */
	deliveryError?: string;
};

export type StatsReport = {
	generatedAt: string;
	/** Size of the daily-breakdown window, in days. */
	windowDays: number;
	campaigns: CampaignStats[];
	totals: {
		campaigns: number;
		emailSent: number;
		emailFailed: number;
		smsSent: number;
		smsFailed: number;
		sentInWindow: number;
		failureAttempts: number;
	};
};

/** Local calendar day as YYYY-MM-DD. Local, not UTC: "sent today" should match the operator's day. */
export function dayKey(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Every local calendar day in the window, oldest first, ending today. */
function localDaySeries(now: Date, days: number): string[] {
	const out: string[] = [];
	for (let back = days - 1; back >= 0; back--) {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
		out.push(dayKey(d));
	}
	return out;
}

/**
 * Reduces one state file to its statistics.
 *
 * Counts are DISTINCT recipients rather than raw records: a state file is
 * append-only, so a recipient who failed on three runs has three failure
 * records but is one person, and reporting "3 failed" for them would overstate
 * the damage. `failureAttempts` keeps the raw number for anyone who wants it.
 */
export function aggregateChannel(state: CampaignState, channel: CampaignChannel, window: string[], now: Date): ChannelStats {
	const sentKeys = new Set<string>();
	const failedKeys = new Set<string>();
	const sentByDay = new Map<string, number>();
	const failedByDay = new Map<string, number>();
	const today = dayKey(now);
	const inWindow = new Set(window);
	let sentToday = 0;
	let sentInWindow = 0;
	let firstSentAt: string | null = null;
	let lastSentAt: string | null = null;

	for (const record of state.sent) {
		const key = recordKey(record);
		if (!key) continue;
		sentKeys.add(key);
		const day = record.at ? dayKey(new Date(record.at)) : "";
		if (day === today) sentToday++;
		if (inWindow.has(day)) {
			sentInWindow++;
			sentByDay.set(day, (sentByDay.get(day) ?? 0) + 1);
		}
		if (record.at && (firstSentAt === null || record.at < firstSentAt)) firstSentAt = record.at;
		if (record.at && (lastSentAt === null || record.at > lastSentAt)) lastSentAt = record.at;
	}

	for (const record of state.failed) {
		const key = recordKey(record);
		if (key) failedKeys.add(key);
		const day = record.at ? dayKey(new Date(record.at)) : "";
		if (inWindow.has(day)) failedByDay.set(day, (failedByDay.get(day) ?? 0) + 1);
	}

	return {
		channel,
		sent: sentKeys.size,
		failed: failedKeys.size,
		failureAttempts: state.failed.length,
		sentToday,
		sentInWindow,
		firstSentAt,
		lastSentAt,
		daily: window.map((day) => ({ day, sent: sentByDay.get(day) ?? 0, failed: failedByDay.get(day) ?? 0 })),
	};
}

export type CollectStatsOptions = {
	/** Restrict to one campaign id; omit to report every campaign that has ever run. */
	campaignId?: string;
	/** Daily-breakdown window in days, today included. */
	windowDays?: number;
	now?: Date;
};

/**
 * Builds the report from state files alone — no network, no credentials, so it
 * works on a laptop with no D1 access and never fails because a provider is
 * down. `--live` and `--delivery` enrich the result afterwards.
 */
export async function collectStats(options: CollectStatsOptions = {}): Promise<StatsReport> {
	const windowDays = options.windowDays ?? 14;
	const now = options.now ?? new Date();
	const window = localDaySeries(now, windowDays);

	const files = await listStateFiles();
	const wanted = options.campaignId
		? files.filter((f) => f.campaignId === options.campaignId)
		: files;

	const byCampaign = new Map<string, { campaignId: string; channels: ChannelStats[] }>();
	for (const file of wanted) {
		const state = await loadState(file.campaignId, file.channel);
		const bucket = byCampaign.get(file.campaignId) ?? { campaignId: file.campaignId, channels: [] };
		bucket.channels.push(aggregateChannel(state, file.channel, window, now));
		byCampaign.set(file.campaignId, bucket);
	}

	const result: CampaignStats[] = [...byCampaign.values()]
		.map(({ campaignId, channels }) => {
			const cfg = campaigns[campaignId];
			const configuredChannels: CampaignChannel[] = cfg?.sms ? ["email", "sms"] : ["email"];
			// Email first, then SMS: the historical channel leads, and the order is
			// stable so two runs of --stats diff cleanly.
			channels.sort((a, b) => a.channel.localeCompare(b.channel));
			const emails = channels.find((c) => c.channel === "email");
			const sms = channels.find((c) => c.channel === "sms");
			const stamps = channels.flatMap((c) => [c.firstSentAt, c.lastSentAt]).filter((v): v is string => Boolean(v));
			return {
				campaignId,
				title: cfg?.title ?? campaignId,
				configuredChannels,
				channels,
				totalSent: (emails?.sent ?? 0) + (sms?.sent ?? 0),
				totalFailed: (emails?.failed ?? 0) + (sms?.failed ?? 0),
				firstSentAt: stamps.length > 0 ? stamps.reduce((a, b) => (a < b ? a : b)) : null,
				lastSentAt: stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null,
			} satisfies CampaignStats;
		})
		// Most recent activity first: the campaign you just ran is the one you want.
		.sort((a, b) => (b.lastSentAt ?? "").localeCompare(a.lastSentAt ?? "") || a.campaignId.localeCompare(b.campaignId));

	const email = result.reduce(
		(acc, c) => {
			const e = c.channels.find((ch) => ch.channel === "email");
			acc.sent += e?.sent ?? 0;
			acc.failed += e?.failed ?? 0;
			return acc;
		},
		{ sent: 0, failed: 0 },
	);
	const sms = result.reduce(
		(acc, c) => {
			const s = c.channels.find((ch) => ch.channel === "sms");
			acc.sent += s?.sent ?? 0;
			acc.failed += s?.failed ?? 0;
			return acc;
		},
		{ sent: 0, failed: 0 },
	);

	return {
		generatedAt: now.toISOString(),
		windowDays,
		campaigns: result,
		totals: {
			campaigns: result.length,
			emailSent: email.sent,
			emailFailed: email.failed,
			smsSent: sms.sent,
			smsFailed: sms.failed,
			sentInWindow: result.reduce((n, c) => n + c.channels.reduce((m, ch) => m + ch.sentInWindow, 0), 0),
			failureAttempts: result.reduce((n, c) => n + c.channels.reduce((m, ch) => m + ch.failureAttempts, 0), 0),
		},
	};
}

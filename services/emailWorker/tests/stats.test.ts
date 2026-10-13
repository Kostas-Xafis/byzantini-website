import { beforeAll, describe, expect, test } from "bun:test";
import {
	aggregateChannel,
	collectStats,
	type CampaignStats,
	type ChannelStats,
	type DailyPoint,
	type SmsDeliveryStats,
	type StatsReport,
} from "../src/campaign/stats";
import { renderStatsReport } from "../src/campaign/statsReport";
import { saveState, type CampaignFailureRecord, type CampaignSendRecord, type CampaignState } from "../src/campaign/state";
import { readState, useScratchDirs } from "./helpers";

/**
 * Statistics: the aggregation in `src/campaign/stats.ts` and the terminal
 * rendering in `src/campaign/statsReport.ts`.
 *
 * Offline by construction. Every state file this file writes goes through
 * `saveState` into the scratch dir `useScratchDirs` redirects
 * `CAMPAIGN_STATE_DIR` to, so the repository's real `campaign-state/` (which
 * marks real students as already sent) is never touched, and nothing here talks
 * to D1, MailerSend or Bird.
 *
 * The clock is pinned: `NOW` is a fixed local noon, every timestamp is built
 * from it, and `collectStats` is handed `{ now: NOW }`. A report rendered from
 * these fixtures is therefore byte-stable, and the local calendar days asserted
 * below are literals rather than whatever today happens to be.
 */
const dirs = useScratchDirs("stats");

/* ------------------------------------------------------------------------- */
/* Clock, days and record fixtures                                           */
/* ------------------------------------------------------------------------- */

/** Pinned local noon. Nothing in this file reads the wall clock. */
const NOW = new Date(2026, 1, 10, 12, 0, 0);
const WINDOW_DAYS = 14;

/**
 * Local calendar day as YYYY-MM-DD.
 *
 * Deliberately a second implementation rather than `dayKey` from the module
 * under test: the day rule ("sent today" is the operator's day, not UTC's) is
 * part of what is being pinned, and a test that inherits the bug it is checking
 * for proves nothing.
 */
function localDayKey(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An ISO stamp `dayOffset` local days from NOW, at a local time of day. */
function localIso(dayOffset: number, hour = 12, minute = 0): string {
	return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, hour, minute, 0, 0).toISOString();
}

/** The local day `dayOffset` days from NOW, as the report would key it. */
function dayAt(dayOffset: number): string {
	return localDayKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset));
}

/** Every local day of a `days`-long window ending on NOW's day, oldest first. */
function windowOf(days: number): string[] {
	const out: string[] = [];
	for (let back = days - 1; back >= 0; back--) out.push(dayAt(-back));
	return out;
}

function sendRecord(key: string, dayOffset: number, hour = 12): CampaignSendRecord {
	return { key, email: key, at: localIso(dayOffset, hour) };
}

function failureRecord(key: string, dayOffset: number, hour = 12, error = "550 mailbox unavailable"): CampaignFailureRecord {
	return { key, email: key, at: localIso(dayOffset, hour), error };
}

function smsRecord(phone: string, dayOffset: number, hour = 12): CampaignSendRecord {
	return { key: phone, phone, at: localIso(dayOffset, hour) };
}

/** A window of quiet days, the shape a channel with no activity reports. */
function zeroDaily(days = WINDOW_DAYS): DailyPoint[] {
	return windowOf(days).map((day) => ({ day, sent: 0, failed: 0 }));
}

/** A window whose per-day counts are given sparsely; every other day is zero. */
function dailyWith(entries: Record<string, { sent?: number; failed?: number }>, days = WINDOW_DAYS): DailyPoint[] {
	return windowOf(days).map((day) => ({ day, sent: entries[day]?.sent ?? 0, failed: entries[day]?.failed ?? 0 }));
}

/* ------------------------------------------------------------------------- */
/* Fixture 1: the state files collectStats reads                             */
/* ------------------------------------------------------------------------- */

/** In the registry, so its title and configured channels come from campaigns.ts. */
const RENEW_ID = "renew-2026";
/** Not in the registry: it must still report, under its own id as the title. */
const LONG_ID = "stats-fixture-very-long-campaign-id-that-a-narrow-terminal-has-to-truncate";
/** Not in the registry and never sent to: the quiet case. */
const QUIET_ID = "stats-fixture-quiet";
/** Greek plus wide emoji: the heading measurement this renderer exists for. */
const GREEK_EMOJI_TITLE = "🎼 Δοκιμή ⭐ — Εγγραφές 2026-27 (σπουδαστές 2025-26)";

/**
 * Three campaigns, four state files, one of them a two-channel campaign.
 *
 * Every record is placed relative to NOW through `localIso`, so the numbers
 * below hold in any timezone. Note the duplicate records: `sent` is a headcount
 * of distinct recipients while the window counts records, so `a@` appears twice
 * on day 0 and `x@` fails twice on day -4.
 */
const FIXTURE_STATES: CampaignState[] = [
	{
		campaignId: RENEW_ID,
		channel: "email",
		createdAt: localIso(-30),
		sent: [
			sendRecord("a@example.gr", -13), // the window's first day
			sendRecord("a@example.gr", 0, 9), // the same person again, today
			sendRecord("b@example.gr", 0, 10),
			sendRecord("c@example.gr", -1),
			sendRecord("d@example.gr", -1, 13),
			sendRecord("e@example.gr", -4),
			sendRecord("f@example.gr", -21), // outside the window, counted all-time
		],
		failed: [failureRecord("x@example.gr", -4, 9), failureRecord("x@example.gr", -4, 11)],
	},
	{
		campaignId: RENEW_ID,
		channel: "sms",
		createdAt: localIso(-30),
		sent: [smsRecord("+306970000001", 0, 9), smsRecord("+306970000001", 0, 10), smsRecord("+306970000002", -1)],
		failed: [failureRecord("+306970000003", 0, 11, "carrier rejected")],
	},
	{
		campaignId: LONG_ID,
		channel: "email",
		createdAt: localIso(-30),
		sent: [sendRecord("g@example.gr", -1, 9), sendRecord("h@example.gr", -2, 9)],
		failed: [],
	},
	{
		campaignId: QUIET_ID,
		channel: "email",
		createdAt: localIso(-30),
		sent: [],
		failed: [],
	},
];

/** Bird's answer for the one campaign that asked (--delivery). */
const DELIVERY: SmsDeliveryStats = {
	tag: `campaign:${RENEW_ID}`,
	period: { from: dayAt(-13), to: dayAt(0), dataAsOf: localIso(0, 11, 30) },
	accepted: 12,
	sent: 12,
	delivered: 10,
	undelivered: 1,
	failed: 1,
	rejected: 0,
	expired: 0,
	deliveryRate: 10 / 12,
	failureRate: 2 / 12,
	latency: { p50: 1200, p95: 3400, p99: 5100 },
	trend: [
		{ bucket: dayAt(-1), accepted: 5, delivered: 4, failed: 1 },
		{ bucket: dayAt(0), accepted: 7, delivered: 6, failed: 0 },
	],
};

beforeAll(async () => {
	for (const state of FIXTURE_STATES) await saveState(state);
});

/**
 * The report as the CLI actually produces it: state files first, then the
 * `--live` / `--delivery` enrichment added afterwards, plus the registry title a
 * campaign definition would supply.
 */
async function buildReport(): Promise<StatsReport> {
	const report = await collectStats({ now: NOW, windowDays: WINDOW_DAYS });
	for (const campaign of report.campaigns) {
		if (campaign.campaignId === RENEW_ID) {
			campaign.audience = { email: 80, sms: 40, smsSkipped: 2 };
			campaign.delivery = DELIVERY;
		} else if (campaign.campaignId === LONG_ID) {
			campaign.title = GREEK_EMOJI_TITLE;
			// SMS audience null, email audience measured: "not measured" must not read as zero.
			campaign.audience = { email: 500, sms: null, smsSkipped: null };
		} else if (campaign.campaignId === QUIET_ID) {
			// Bird answered, and had no rows for this tag.
			campaign.delivery = null;
		}
	}
	return report;
}

/* ------------------------------------------------------------------------- */
/* Fixture 2: hand-built campaign/channel stats for the renderer tests       */
/* ------------------------------------------------------------------------- */

type Channel = "email" | "sms";

function channelStats(channel: Channel, over: Partial<Omit<ChannelStats, "channel">> = {}): ChannelStats {
	return {
		channel,
		sent: 0,
		failed: 0,
		failureAttempts: 0,
		sentToday: 0,
		sentInWindow: 0,
		firstSentAt: null,
		lastSentAt: null,
		daily: zeroDaily(),
		...over,
	};
}

function campaignStats(over: Partial<CampaignStats> & { campaignId: string }): CampaignStats {
	const { campaignId, ...rest } = over;
	return {
		campaignId,
		title: campaignId,
		configuredChannels: ["email"],
		channels: [channelStats("email")],
		totalSent: 0,
		totalFailed: 0,
		firstSentAt: null,
		lastSentAt: null,
		...rest,
	};
}

/** A one-channel campaign whose whole audience is on one side of the progress bar. */
function audienceProbe(id: string, sent: number, reach: number): CampaignStats {
	const stamp = localIso(0, 9);
	return campaignStats({
		campaignId: id,
		channels: [
			channelStats("email", {
				sent,
				sentInWindow: sent,
				sentToday: sent,
				firstSentAt: stamp,
				lastSentAt: stamp,
				daily: dailyWith({ [dayAt(0)]: { sent } }),
			}),
		],
		totalSent: sent,
		firstSentAt: stamp,
		lastSentAt: stamp,
		audience: { email: reach, sms: null, smsSkipped: null },
	});
}

/* ------------------------------------------------------------------------- */
/* Reading a rendered report back                                            */
/* ------------------------------------------------------------------------- */

type FrameBlock = { heading: string; lines: string[] };

/**
 * Splits a framed render into its boxes.
 *
 * A box is `┌─ heading ───┐` … `└───┘` with `│ … │` bodies, so the boundaries
 * are unambiguous. Body lines come back unpadded, which is what the column
 * parsers below want.
 */
function frameBlocks(text: string): FrameBlock[] {
	const blocks: FrameBlock[] = [];
	let current: FrameBlock | null = null;
	for (const line of text.split("\n")) {
		if (line.startsWith("┌─ ")) {
			const inner = line.slice(3, line.endsWith("┐") ? -1 : undefined);
			const cut = inner.lastIndexOf(" ─");
			current = { heading: (cut >= 0 ? inner.slice(0, cut) : inner).trimEnd(), lines: [] };
			blocks.push(current);
			continue;
		}
		if (line.startsWith("└")) {
			current = null;
			continue;
		}
		if (current !== null && line.startsWith("│ ")) {
			current.lines.push(line.slice(2, line.endsWith("│") ? -1 : undefined).trimEnd());
		}
	}
	return blocks;
}

function blockFor(blocks: FrameBlock[], headingFragment: string): FrameBlock {
	const block = blocks.find((candidate) => candidate.heading.includes(headingFragment));
	if (!block) throw new Error(`No frame block whose heading contains ${JSON.stringify(headingFragment)}`);
	return block;
}

/**
 * The `In window` cell of every row in a block's channel-activity table.
 *
 * Scoped to the rows under the `Channel Sent Failed Today In window Last sent`
 * header and throws rather than skipping on an unparsed row, so a change in the
 * table's shape fails the test instead of quietly summing to zero.
 */
function channelRowsInWindow(block: FrameBlock): number[] {
	const start = block.lines.findIndex((line) => /^\s*Channel\s+Sent\s+Failed\s+Today\s+In window\s+Last sent\s*$/.test(line));
	if (start < 0) throw new Error(`No channel table in block ${JSON.stringify(block.heading)}`);
	const cells: number[] = [];
	for (let i = start + 1; i < block.lines.length; i++) {
		const line = block.lines[i];
		if (line.trim() === "") break;
		// Email|SMS, then Sent, Failed, Today, In window, Last sent.
		const match = /^\s*(?:Email|SMS)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+\S/.exec(line);
		if (!match) throw new Error(`Unparsed channel row in block ${JSON.stringify(block.heading)}: ${JSON.stringify(line)}`);
		cells.push(Number(match[4].replace(/,/g, "")));
	}
	return cells;
}

/** The compact `Daily (…)  … · N in window` line of an all-campaigns block. */
function compactLine(block: FrameBlock): string {
	const line = block.lines.find((candidate) => /Daily \((?:last )?[\d]+ ?d/.test(candidate));
	if (line === undefined) throw new Error(`No compact Daily line in block ${JSON.stringify(block.heading)}`);
	return line;
}

/** The figure the compact line prints, or null when it prints "no activity". */
function compactTotal(block: FrameBlock): number | null {
	const match = /([\d,]+) in window/.exec(compactLine(block));
	return match ? Number(match[1].replace(/,/g, "")) : null;
}

type ProgressCell = { line: string; filled: number; total: number; percent: string };

/** The `Progress` cell of a block's audience table: bar, its length, and the percentage. */
function progressCell(block: FrameBlock): ProgressCell {
	for (const line of block.lines) {
		const match = /([█░]+)\s+([\d.]+%)/.exec(line);
		if (match) {
			return { line, filled: (match[1].match(/█/g) ?? []).length, total: match[1].length, percent: match[2] };
		}
	}
	throw new Error(`No progress bar in block ${JSON.stringify(block.heading)}`);
}

/**
 * The text with its frame glyphs and line breaks removed.
 *
 * A sentence that wrapped still has to be assertable: the border column that sat
 * between its two halves is not part of the prose.
 */
function flatten(text: string): string {
	return text.replace(/[│┌┐└┘─]/g, " ").replace(/\s+/g, " ").trim();
}

/** Every number reachable in a value, with its path — used to hunt NaN and Infinity. */
function collectNumbers(value: unknown, path: string, out: { path: string; value: number }[]): void {
	if (typeof value === "number") {
		out.push({ path, value });
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => collectNumbers(item, `${path}[${index}]`, out));
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) collectNumbers(item, `${path}.${key}`, out);
	}
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("campaign statistics", () => {
	test("aggregateChannel counts distinct recipients, counts records in the window, and fills quiet days", () => {
		// One state that exercises every rule at once: a recipient sent to twice, a
		// recipient that both succeeded and failed, a recipient that failed on two
		// separate attempts, a record inside the window, one outside it, one today,
		// and a record with no addressing field at all.
		const DUP = "dup@example.gr";
		const BOTH = "both@example.gr";
		const OLD = "old@example.gr";
		const FLAKY = "flaky@example.gr";
		const state: CampaignState = {
			campaignId: "aggregate-probe",
			channel: "email",
			createdAt: localIso(-30),
			sent: [
				sendRecord(DUP, 0, 9),
				sendRecord(DUP, 0, 10), // same person, second record
				sendRecord(BOTH, 0, 11), // also appears in `failed`
				sendRecord(OLD, -21), // outside a 5-day window, still all-time
				{ at: localIso(0, 8) }, // keyless: no address to dedupe on, ignored
			],
			failed: [
				failureRecord(BOTH, -1, 9),
				failureRecord(FLAKY, -1, 10),
				failureRecord(FLAKY, -4, 9), // the window's first day
				failureRecord(FLAKY, 0, 9),
			],
		};
		const window = windowOf(5);
		expect(window).toEqual(["2026-02-06", "2026-02-07", "2026-02-08", "2026-02-09", "2026-02-10"]);

		for (const channel of ["email", "sms"] as const) {
			const stats = aggregateChannel(state, channel, window, NOW);
			const expected: [string, unknown, unknown][] = [
				["channel", stats.channel, channel],
				["sent", stats.sent, 3], // DUP, BOTH, OLD — the keyless record is not a recipient
				["failed", stats.failed, 2], // BOTH, FLAKY
				["failureAttempts", stats.failureAttempts, 4], // raw failure records
				["sentToday", stats.sentToday, 3], // records today: DUP ×2, BOTH
				["sentInWindow", stats.sentInWindow, 3], // records in the window; OLD is outside it
				["firstSentAt", stats.firstSentAt, localIso(-21)],
				["lastSentAt", stats.lastSentAt, localIso(0, 11)],
				["daily.length", stats.daily.length, 5],
			];
			for (const [label, actual, want] of expected) expect(actual, `aggregateChannel(${channel}).${label}`).toBe(want);

			// Dedupe applies to the headcount, not to the window counts: DUP is one
			// person in `sent` but two records in sentToday/sentInWindow/daily.
			expect(stats.sent, "a duplicated recipient is one person").toBe(3);
			expect(stats.sentInWindow, "a duplicated record is two records in the window").toBe(3);
			expect(stats.failed, "a recipient failing twice is one failed recipient").toBe(2);
			expect(stats.failureAttempts, "a recipient failing twice is two failure attempts").toBe(4);
			// first/last sent span every send, inside the window or outside it.
			expect(stats.firstSentAt, "first sent is the oldest send, outside the window").toBe(localIso(-21));
			expect(stats.lastSentAt, "last sent is the newest send, today at 11:00").toBe(localIso(0, 11));

			// Every requested day, oldest first, gaps zero-filled rather than omitted.
			expect(stats.daily, `aggregateChannel(${channel}).daily`).toEqual([
				{ day: "2026-02-06", sent: 0, failed: 1 },
				{ day: "2026-02-07", sent: 0, failed: 0 },
				{ day: "2026-02-08", sent: 0, failed: 0 },
				{ day: "2026-02-09", sent: 0, failed: 2 },
				{ day: "2026-02-10", sent: 3, failed: 1 },
			]);
			expect(
				stats.daily.map((point) => point.day),
				"daily is one point per requested day, in order",
			).toEqual(window);
			expect(
				stats.daily.reduce((n, point) => n + point.sent, 0),
				"the daily series sums to the window total",
			).toBe(stats.sentInWindow);

			// No count anywhere is NaN or Infinity, whatever the input looked like.
			const numbers: { path: string; value: number }[] = [];
			collectNumbers(stats, `aggregateChannel(${channel})`, numbers);
			expect(numbers.length).toBeGreaterThan(0);
			for (const { path, value } of numbers) expect(Number.isFinite(value), `${path} is ${value}`).toBe(true);
		}

		// An empty state is all zeros and nulls — not NaN, not a missing day.
		const empty: CampaignState = { campaignId: "aggregate-empty", channel: "email", createdAt: localIso(0), sent: [], failed: [] };
		const emptyStats = aggregateChannel(empty, "email", window, NOW);
		expect(emptyStats).toMatchObject({ sent: 0, failed: 0, failureAttempts: 0, sentToday: 0, sentInWindow: 0, firstSentAt: null, lastSentAt: null });
		expect(emptyStats.daily).toEqual(windowOf(5).map((day) => ({ day, sent: 0, failed: 0 })));

		// `daily` is window-shaped, so any real window yields at least one point:
		// collectStats defaults to 14 days and never builds an empty window. The
		// only way to get an empty `daily` is to hand in an empty window, which no
		// caller does.
		for (const days of [1, 5, 14, 30]) {
			const series = windowOf(days);
			expect(series).toHaveLength(days);
			const stats = aggregateChannel(empty, "email", series, NOW);
			expect(stats.daily.length, `a ${days}-day window has ${days} daily points`).toBe(days);
			expect(stats.daily.length).toBeGreaterThan(0);
		}
		expect(aggregateChannel(empty, "email", [], NOW).daily).toEqual([]);
	});

	test("collectStats totals the state files, sorts by recency, and honours the id and window filters", async () => {
		// Hand-computed from FIXTURE_STATES, which is exactly what beforeAll wrote:
		//   renew-2026 email: sends a(×2), b, c, d, e, f = 7 records / 6 recipients;
		//                     failures x@ ×2 = 1 recipient, 2 attempts
		//   renew-2026 sms:   sends ×3 = 2 recipients; failure ×1
		//   long id email:    sends g, h = 2 recipients
		//   quiet email:      nothing
		// In window (14 days ending 2026-02-10): 6 + 3 + 2 = 11 records.
		const report = await collectStats({ now: NOW, windowDays: WINDOW_DAYS });
		expect(report.windowDays).toBe(WINDOW_DAYS);
		expect(report.generatedAt).toBe(NOW.toISOString());
		expect(report.totals).toEqual({
			campaigns: 3,
			emailSent: 8, // 6 + 2
			emailFailed: 1,
			smsSent: 2,
			smsFailed: 1,
			sentInWindow: 11,
			failureAttempts: 3, // 2 email records + 1 SMS record
		});

		// The same totals, re-derived from the files on disk rather than the fixture
		// constant, so a mismatch between "what we wrote" and "what was counted"
		// cannot hide behind a shared number.
		const distinct = (records: CampaignSendRecord[]) =>
			new Set(records.map((record) => (record.key ?? record.phone ?? record.email ?? "").toLowerCase()).filter((key) => key !== "")).size;
		const windowSet = new Set(windowOf(WINDOW_DAYS));
		const fromFiles = { campaigns: new Set<string>(), emailSent: 0, emailFailed: 0, smsSent: 0, smsFailed: 0, sentInWindow: 0, failureAttempts: 0 };
		for (const state of FIXTURE_STATES) {
			const onDisk = readState(dirs, state.campaignId, state.channel === "sms" ? "sms" : "email");
			expect(onDisk, `${state.campaignId}.${state.channel} state file`).not.toBeNull();
			if (!onDisk) continue;
			fromFiles.campaigns.add(state.campaignId);
			fromFiles.failureAttempts += onDisk.failed.length;
			fromFiles.sentInWindow += onDisk.sent.filter((record) => windowSet.has(localDayKey(new Date(record.at)))).length;
			if (state.channel === "sms") {
				fromFiles.smsSent += distinct(onDisk.sent);
				fromFiles.smsFailed += distinct(onDisk.failed);
			} else {
				fromFiles.emailSent += distinct(onDisk.sent);
				fromFiles.emailFailed += distinct(onDisk.failed);
			}
		}
		expect(report.totals).toEqual({
			campaigns: fromFiles.campaigns.size,
			emailSent: fromFiles.emailSent,
			emailFailed: fromFiles.emailFailed,
			smsSent: fromFiles.smsSent,
			smsFailed: fromFiles.smsFailed,
			sentInWindow: fromFiles.sentInWindow,
			failureAttempts: fromFiles.failureAttempts,
		});

		// The files really hold what the hand computation assumed.
		expect(readState(dirs, RENEW_ID)?.sent).toHaveLength(7);
		expect(readState(dirs, RENEW_ID)?.failed).toHaveLength(2);
		expect(readState(dirs, RENEW_ID, "sms")?.sent).toHaveLength(3);
		expect(readState(dirs, RENEW_ID, "sms")?.failed).toHaveLength(1);
		expect(readState(dirs, LONG_ID)?.sent).toHaveLength(2);
		expect(readState(dirs, QUIET_ID)?.sent).toHaveLength(0);

		// Most recent activity first; a campaign that never sent sorts last rather
		// than being dropped.
		expect(report.campaigns.map((campaign) => campaign.campaignId)).toEqual([RENEW_ID, LONG_ID, QUIET_ID]);
		expect(report.campaigns.map((campaign) => campaign.lastSentAt)).toEqual([localIso(0, 10), localIso(-1, 9), null]);
		expect(report.campaigns[0].totalSent).toBe(8); // 6 email + 2 SMS
		expect(report.campaigns[0].firstSentAt).toBe(localIso(-21));

		// A campaign whose definition is gone still reports, titled by its id; a
		// registry campaign keeps its registry title and declared channels.
		const long = campaignById(report, LONG_ID);
		const quiet = campaignById(report, QUIET_ID);
		const renew = campaignById(report, RENEW_ID);
		expect(long.title).toBe(LONG_ID);
		expect(quiet.title).toBe(QUIET_ID);
		expect(renew.title).not.toBe(RENEW_ID);
		expect(quiet.channels).toHaveLength(1); // the file exists, so the channel is reported
		expect(renew.configuredChannels).toEqual(["email", "sms"]);
		expect(long.configuredChannels).toEqual(["email"]);

		// Filtering to one id returns only that campaign, and its totals are scoped
		// to it rather than copied from the report-wide block.
		const only = await collectStats({ campaignId: LONG_ID, now: NOW, windowDays: WINDOW_DAYS });
		expect(only.campaigns.map((campaign) => campaign.campaignId)).toEqual([LONG_ID]);
		expect(only.totals).toEqual({ campaigns: 1, emailSent: 2, emailFailed: 0, smsSent: 0, smsFailed: 0, sentInWindow: 2, failureAttempts: 0 });

		// windowDays decides the daily series length, and the window really is a
		// window: today-only drops the all-time counts' contribution, not the counts.
		for (const days of [1, 3, 14]) {
			const windowed = await collectStats({ now: NOW, windowDays: days });
			expect(windowed.windowDays).toBe(days);
			for (const campaign of windowed.campaigns) {
				for (const channel of campaign.channels) {
					expect(channel.daily, `${campaign.campaignId}.${channel.channel} daily length`).toHaveLength(days);
					expect(channel.daily.at(-1)?.day, "the series ends today").toBe(dayAt(0));
					expect(channel.daily[0].day, "the series starts windowDays-1 days ago").toBe(dayAt(-(days - 1)));
				}
			}
		}
		const todayOnly = await collectStats({ now: NOW, windowDays: 1 });
		const renewEmail = campaignById(todayOnly, RENEW_ID).channels.find((channel) => channel.channel === "email");
		expect(renewEmail?.sentInWindow, "today-only window: a@ and b@ only").toBe(2);
		expect(renewEmail?.sentToday).toBe(2);
		expect(renewEmail?.sent, "the all-time headcount ignores the window").toBe(6);
	});

	test("every line fits the requested width and every frame shares one width, at 120 down to 40", async () => {
		const report = await buildReport();
		for (const width of [120, 100, 80, 64, 50, 40]) {
			for (const single of [true, false]) {
				const where = `width ${width}, single ${single}`;
				const text = renderStatsReport(report, { single, width });
				expect(text.endsWith("\n"), `${where}: the report is a complete document`).toBe(true);
				const lines = text.split("\n").slice(0, -1);

				// Bun.stringWidth is an independent measurement, not the renderer's own
				// displayWidth: the two agreeing is the point of the assertion.
				for (const line of lines) {
					expect(Bun.stringWidth(line), `${where}: over-wide line ${JSON.stringify(line)}`).toBeLessThanOrEqual(width);
				}

				const framed = lines.filter((line) => line.startsWith("│") || line.startsWith("┌") || line.startsWith("└"));
				// Below 64 the box is dropped on purpose (plain mode); at and above it
				// the frame must be there, or this test would pass vacuously.
				if (width >= 64) expect(framed.length, `${where}: expected framed output`).toBeGreaterThan(0);
				if (framed.length === 0) continue;

				// One inner width for the whole report: every border, heading and body
				// line of every box is the same number of columns wide.
				const frameWidths = [...new Set(framed.map((line) => Bun.stringWidth(line)))];
				expect(frameWidths, `${where}: frames share one width`).toHaveLength(1);

				// And each one is actually closed: │ … │, ┌ … ┐, └ … ┘.
				for (const line of framed) {
					expect(Bun.stringWidth(line), `${where}: ${JSON.stringify(line)}`).toBe(frameWidths[0]);
					if (line.startsWith("│")) expect(line.endsWith("│"), `${where}: unclosed body ${JSON.stringify(line)}`).toBe(true);
					else if (line.startsWith("┌")) expect(line.endsWith("┐"), `${where}: unclosed heading ${JSON.stringify(line)}`).toBe(true);
					else expect(line.endsWith("┘"), `${where}: unclosed footer ${JSON.stringify(line)}`).toBe(true);
				}

				// The rule drawn above the boxes lines up with them too.
				const rules = lines.filter((line) => /^─+$/.test(line));
				expect(rules.length, `${where}: the report opens with a rule`).toBeGreaterThan(0);
				for (const rule of rules) expect(Bun.stringWidth(rule), `${where}: rule does not span the frames`).toBe(frameWidths[0]);
			}
		}
	});

	test("the compact in-window total is the channel table's own In window sum, per campaign", async () => {
		// The regression: the compact `Daily (…) … N in window` figure is the same
		// `sentInWindow` the channel table prints. Deriving it by re-summing the
		// daily series instead would add the failures in the window (2 email + 1
		// SMS here) and print 12 where the table says 9. The fixture therefore has
		// to contain in-window failures, which it does.
		const report = await buildReport();
		const blocks = frameBlocks(renderStatsReport(report, { width: 120 }));
		expect(blocks).toHaveLength(report.campaigns.length + 1);
		const totalsBlock = blocks.at(-1);
		expect(totalsBlock?.heading).toBe("Totals");
		const campaignBlocks = blocks.slice(0, -1);
		// Most recent activity first (see the ordering test above), so block 0 is
		// renew-2026 — the one with both channels and in-window failures.
		expect(campaignBlocks[0].heading).toContain(RENEW_ID);
		expect(campaignBlocks[1].heading, "the emoji title survives into the heading").toContain("🎼");
		expect(campaignBlocks[2].heading).toContain(QUIET_ID);

		const renew = report.campaigns[0];
		const renewFailuresInWindow = renew.channels.reduce((n, channel) => n + channel.daily.reduce((m, point) => m + point.failed, 0), 0);
		expect(renewFailuresInWindow, "the fixture must have failures inside the window or the regression cannot fire").toBe(3);

		for (const [index, campaign] of report.campaigns.entries()) {
			const block = campaignBlocks[index];
			const cells = channelRowsInWindow(block);
			expect(cells, `${campaign.campaignId}: one In window cell per channel row`).toHaveLength(campaign.channels.length);
			const expected = campaign.channels.reduce((n, channel) => n + channel.sentInWindow, 0);
			expect(cells.reduce((a, b) => a + b, 0), `${campaign.campaignId}: cells sum to sentInWindow`).toBe(expected);
			if (expected > 0) {
				expect(compactTotal(block), `${campaign.campaignId}: compact total equals the table`).toBe(expected);
			} else {
				// Nothing sent and nothing failed in the window reads as "no activity",
				// not as a bare 0 the eye would read as "not collected".
				expect(compactLine(block), `${campaign.campaignId}: a quiet window says so`).toContain("no activity");
			}
		}

		// Per campaign, not report-wide: renew-2026 prints 9 (6 email + 3 SMS), the
		// long id prints 2, and the report-wide 11 appears in the totals block only.
		const renewTotal = compactTotal(campaignBlocks[0]);
		const longTotal = compactTotal(campaignBlocks[1]);
		expect(renewTotal).toBe(9);
		expect(longTotal).toBe(2);
		expect(report.totals.sentInWindow).toBe(11);
		expect(renewTotal).not.toBe(report.totals.sentInWindow);
		expect(longTotal).not.toBe(report.totals.sentInWindow);
		expect(renewTotal, "failures in the window did not leak into the compact total").not.toBe(6 + 3 + renewFailuresInWindow);
		expect(compactTotal(campaignBlocks[2]), "a campaign with no in-window activity prints no figure").toBeNull();

		// The totals block agrees with the cells it summarises.
		expect(report.totals.sentInWindow).toBe(report.campaigns.reduce((n, campaign) => n + campaign.channels.reduce((m, channel) => m + channel.sentInWindow, 0), 0));
		expect(totalsBlock?.lines.join("\n")).toMatch(new RegExp(`In window\\s+${report.totals.sentInWindow}\\b`));
	});

	test("a campaign with no sends, a null delivery block and a failed Bird lookup all still render", () => {
		const DELIVERY_ERROR = "Bird /v1/sms/stats/tags returned 503 (upstream unavailable)";
		const stamp = localIso(0, 9);
		const report: StatsReport = {
			generatedAt: NOW.toISOString(),
			windowDays: WINDOW_DAYS,
			campaigns: [
				// Zero sends, an all-zero daily series, and a zero-recipient audience.
				campaignStats({ campaignId: "stats-degenerate-zero", title: "Καμία αποστολή" }),
				// Failures without sends: the window is not quiet, it just sent nothing.
				campaignStats({
					campaignId: "stats-degenerate-failures-only",
					title: "Μόνο αποτυχίες",
					channels: [channelStats("email", { failed: 2, failureAttempts: 2, daily: dailyWith({ [dayAt(-1)]: { failed: 2 } }) })],
					totalFailed: 2,
				}),
				// `--delivery` asked, Bird had no rows for the tag.
				campaignStats({ campaignId: "stats-degenerate-null-delivery", title: "Bird χωρίς γραμμές", delivery: null }),
				// `--delivery` asked, Bird could not answer: the rest of the report survives.
				campaignStats({ campaignId: "stats-degenerate-error", title: "Bird σφάλμα", deliveryError: DELIVERY_ERROR }),
				// Greek title, wide emoji, an id far longer than any frame, a measured
				// email audience of zero and an unmeasured SMS audience.
				campaignStats({
					campaignId: LONG_ID,
					title: GREEK_EMOJI_TITLE,
					configuredChannels: ["email", "sms"],
					channels: [
						channelStats("email", {
							sent: 7,
							failed: 1,
							failureAttempts: 1,
							sentToday: 7,
							sentInWindow: 7,
							firstSentAt: stamp,
							lastSentAt: stamp,
							daily: dailyWith({ [dayAt(0)]: { sent: 7, failed: 1 } }),
						}),
					],
					totalSent: 7,
					totalFailed: 1,
					firstSentAt: stamp,
					lastSentAt: stamp,
					audience: { email: 0, sms: null, smsSkipped: null },
				}),
			],
			totals: { campaigns: 5, emailSent: 7, emailFailed: 1, smsSent: 0, smsFailed: 0, sentInWindow: 7, failureAttempts: 3 },
		};

		// Nothing degenerates into a placeholder: no NaN%, no "undefined" field, no
		// infinite count, and the frames still fit.
		for (const width of [100, 64]) {
			for (const single of [true, false]) {
				const text = renderStatsReport(report, { single, width });
				const where = `width ${width}, single ${single}`;
				for (const line of text.split("\n")) {
					expect(Bun.stringWidth(line), `${where}: over-wide line ${JSON.stringify(line)}`).toBeLessThanOrEqual(width);
				}
				for (const bad of ["NaN", "undefined", "Infinity"]) {
					expect(text, `${where}: rendered ${bad}`).not.toContain(bad);
				}
			}
		}

		const blocks = frameBlocks(renderStatsReport(report, { width: 100 }));
		expect(blocks).toHaveLength(report.campaigns.length + 1);

		// Zero sends: the counts are printed as 0 (a different fact from "no row"),
		// the in-window series says nothing happened, and no bar is drawn for it.
		const zero = blockFor(blocks, "stats-degenerate-zero");
		expect(channelRowsInWindow(zero)).toEqual([0]);
		expect(compactLine(zero)).toContain("no activity");
		expect(zero.lines.join("\n"), "0 is printed, not blanked: Sent/Failed/Today/In window/Last sent").toMatch(/^\s*Email\s+0\s+0\s+0\s+0\s+—\s*$/m);
		expect(flatten(renderStatsReport(report, { single: true, width: 100 }))).toContain("no activity in this window");

		// Failures with no sends: "0 in window", which is not the same as "no activity".
		const failuresOnly = blockFor(blocks, "stats-degenerate-failures-only");
		expect(channelRowsInWindow(failuresOnly)).toEqual([0]);
		expect(compactLine(failuresOnly)).toContain("0 in window");
		expect(compactLine(failuresOnly)).not.toContain("no activity");

		// Bird: no rows, and Bird: unreachable. Both render inline, neither hides the
		// local numbers above it.
		expect(blockFor(blocks, "stats-degenerate-null-delivery").lines.join("\n")).toContain("No Bird delivery records for this campaign's SMS tag yet.");
		const birdError = blockFor(blocks, "stats-degenerate-error").lines.join("\n");
		expect(birdError).toContain("Warning —");
		expect(birdError).toContain("returned 503");
		expect(flatten(birdError)).toContain(`Warning — ${DELIVERY_ERROR}`);
		expect(birdError, "the campaign's own numbers are still there").toContain("Channels configured");

		// Wide glyphs plus a long id: the heading keeps the emoji, and the audience
		// section distinguishes "measured zero" from "not measured".
		const wide = blockFor(blocks, "🎼");
		expect(wide.heading).toContain("🎼");
		const audienceText = wide.lines.join("\n");
		expect(audienceText).toContain("nothing to reach"); // audience 0, not a division by zero
		expect(audienceText).toContain("not measured — run with --live"); // sms audience null
		expect(audienceText).not.toContain("NaN%");
	});

	test("an audience that shrank keeps its true percentage and caps its bar at full width", () => {
		// renew-2026's audience is a live segment: whoever registers after the send
		// leaves it, so `sent` can exceed `audience`. 175 sent against 100 remaining
		// is a real observation about the list, not an arithmetic error.
		const report: StatsReport = {
			generatedAt: NOW.toISOString(),
			windowDays: WINDOW_DAYS,
			campaigns: [audienceProbe("audience-over-100", 175, 100), audienceProbe("audience-exactly-100", 100, 100), audienceProbe("audience-half", 50, 100)],
			totals: { campaigns: 3, emailSent: 325, emailFailed: 0, smsSent: 0, smsFailed: 0, sentInWindow: 325, failureAttempts: 0 },
		};
		const text = renderStatsReport(report, { width: 120 });
		for (const line of text.split("\n")) {
			expect(Bun.stringWidth(line), `over-wide line ${JSON.stringify(line)}`).toBeLessThanOrEqual(120);
		}
		expect(text).not.toContain("NaN");

		const blocks = frameBlocks(text);
		const over = progressCell(blockFor(blocks, "audience-over-100"));
		const exact = progressCell(blockFor(blocks, "audience-exactly-100"));
		const half = progressCell(blockFor(blocks, "audience-half"));

		// The true percentage is kept: clamping it to 100.0% would hide that the
		// list moved, which is precisely the thing the operator needs to see.
		expect(over.percent).toBe("175.0%");
		expect(over.line).not.toContain("100.0%");
		expect(exact.percent).toBe("100.0%");
		expect(half.percent).toBe("50.0%");

		// The bar, however, stops at full: all three bars are the same length, and
		// the over-100% one is completely filled rather than longer than the frame.
		expect(over.total).toBe(exact.total);
		expect(over.total).toBe(half.total);
		expect(over.filled, "an over-full bar is exactly full, never wider").toBe(over.total);
		expect(exact.filled).toBe(exact.total);
		expect(half.filled).toBe(Math.round(half.total / 2));
		expect(over.filled).toBeGreaterThan(half.filled);

		// Remaining is floored at zero: 175 sent to a 100-person audience is 0 left,
		// not -75.
		expect(over.line).toMatch(/^\s*Email\s+100\s+175\s+0\s/);
		expect(over.line).not.toContain("-75");

		// And the report says why the percentage can exceed 100, in prose.
		const flat = flatten(text);
		expect(flat).toContain("Sent exceeds the current audience — 75 recipients have since left this segment");
		expect(flat).toContain("they have now registered");
	});
});

/** `report.campaigns` lookup that fails loudly instead of returning undefined. */
function campaignById(report: StatsReport, campaignId: string): CampaignStats {
	const campaign = report.campaigns.find((candidate) => candidate.campaignId === campaignId);
	if (!campaign) throw new Error(`No campaign ${campaignId} in the report (${report.campaigns.map((c) => c.campaignId).join(", ")})`);
	return campaign;
}

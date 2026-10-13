import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CampaignChannel } from "./types";

/**
 * One record per attempted send. The `key` is the channel's addressing field —
 * the email address for email runs, the E.164 phone for SMS runs — so a single
 * campaign can be resumed independently on each channel without one channel's
 * progress hiding the other's.
 */
export type CampaignSendRecord = {
	/** Dedupe key. Older state files predate this field; use recordKey() to read them. */
	key?: string;
	email?: string;
	phone?: string;
	at: string;
};

export type CampaignFailureRecord = CampaignSendRecord & { error: string };

export type CampaignState = {
	campaignId: string;
	/** Older state files predate this field and are, by construction, email runs. */
	channel?: CampaignChannel;
	createdAt: string;
	sent: CampaignSendRecord[];
	failed: CampaignFailureRecord[];
};

/**
 * Where resume state lives.
 *
 * Overridable with `CAMPAIGN_STATE_DIR`, and resolved per call rather than at
 * import time so a caller can point it elsewhere before the first read. This
 * matters for the test suite: writing test state into the real
 * `campaign-state/` would mark real students as already-sent and silently
 * shrink a live campaign.
 */
function stateDir(): string {
	const override = process.env.CAMPAIGN_STATE_DIR?.trim();
	return override ? path.resolve(override) : path.resolve(import.meta.dir, "../../campaign-state");
}

/** The addressing field a record was deduped on, tolerating state files written before `key` existed. */
export function recordKey(record: CampaignSendRecord): string {
	return (record.key ?? record.phone ?? record.email ?? "").toLowerCase();
}

/**
 * Email runs keep the historical `<id>.json` name so existing campaign state
 * (and the resume behaviour it encodes) survives this change untouched; SMS
 * runs get their own file so neither channel can mark the other as done.
 */
function stateFile(campaignId: string, channel: CampaignChannel): string {
	return path.join(stateDir(), channel === "sms" ? `${campaignId}.sms.json` : `${campaignId}.json`);
}

function emptyState(campaignId: string, channel: CampaignChannel): CampaignState {
	return { campaignId, channel, createdAt: new Date().toISOString(), sent: [], failed: [] };
}

export async function loadState(campaignId: string, channel: CampaignChannel = "email"): Promise<CampaignState> {
	try {
		const raw = await readFile(stateFile(campaignId, channel), "utf8");
		const parsed = JSON.parse(raw) as CampaignState;
		// Merge over the empty state so a file written by an older version still
		// gains the fields it predates (notably `channel` and `key`).
		return { ...emptyState(campaignId, channel), ...parsed, campaignId, channel };
	} catch {
		return emptyState(campaignId, channel);
	}
}

export async function saveState(state: CampaignState): Promise<void> {
	await mkdir(stateDir(), { recursive: true });
	await writeFile(stateFile(state.campaignId, state.channel ?? "email"), JSON.stringify(state, null, 2));
}

/**
 * Every campaign/channel that has ever recorded a run, derived from the state
 * filenames on disk.
 *
 * Stats are reported from what the CLI actually did, so the files ARE the
 * registry of runs: a campaign whose definition was later removed from
 * `campaigns.ts` still reports the sends it made. The channel comes from the
 * filename because files written before channels existed have no `channel`
 * field and are, by construction, email runs.
 */
export async function listStateFiles(): Promise<{ campaignId: string; channel: CampaignChannel }[]> {
	let names: string[];
	try {
		names = await readdir(stateDir());
	} catch {
		// No state directory yet: nothing has ever run, which is not an error.
		return [];
	}
	return names
		.filter((name) => name.endsWith(".json"))
		.map((name) => {
			const channel: CampaignChannel = name.endsWith(".sms.json") ? "sms" : "email";
			return { campaignId: name.replace(/\.sms\.json$|\.json$/, ""), channel };
		})
		.sort((a, b) => a.campaignId.localeCompare(b.campaignId) || a.channel.localeCompare(b.channel));
}

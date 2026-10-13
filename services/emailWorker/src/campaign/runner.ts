import { sleep } from "bun";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyToTemplate, mailService, renderMailHtml } from "../mailersend";
import { assertPlaceholdersFilled, renderSmsText, resolveSmsFrom, smsService } from "../sms";
import type { SmsCategory } from "../sms/bird";
import { maskPhone } from "../sms/phone";
import { estimateSegments } from "../sms/segments";
import { filterBlacklisted, filterBlacklistedPhones } from "./blacklist";
import { loadState, recordKey, saveState } from "./state";
import {
	DEFAULT_SMS_MAX_SEGMENTS,
	type CampaignChannel,
	type CampaignConfig,
	type CampaignRecipient,
	type CampaignSummary,
	type SmsCampaignConfig,
} from "./types";

/**
 * Where dry-run previews are written.
 *
 * Overridable with `CAMPAIGN_OUT_DIR` (resolved per call) so the test suite can
 * write previews to a temp directory instead of the repo's `out/`.
 */
function outDir(): string {
	const override = process.env.CAMPAIGN_OUT_DIR?.trim();
	return override ? path.resolve(override) : path.resolve(import.meta.dir, "../../out");
}

export type RunOptions = {
	db: "sqlite-prod" | "sqlite-dev";
	/** Dry-run (default): no messages are sent, only a report + previews. */
	mode: "dry" | "send";
	/** Which channel this run targets. Chosen by the CLI from --sms / --channel. */
	channel: CampaignChannel;
	limit?: number;
	/** How many sample messages to render into out/ during a dry run. */
	previewCount?: number;
	/** Send one test email of the first recipient's data to this address (e.g. the owner). */
	testMailTo?: string;
	/** Send one test SMS of the first recipient's data to this number (e.g. the owner). */
	testSmsTo?: string;
	/** Ad-hoc SMS body used instead of the campaign's compiled SMS template. */
	smsMessage?: string;
	/** Category for an ad-hoc SMS body; the campaign config supplies its own. */
	smsCategory?: SmsCategory;
	/** Segment budget override for SMS runs. */
	smsMaxSegments?: number;
	/** Set to false to skip the poster attachment (inline image only). Default: include attachments. */
	attachment?: boolean;
	/** Milliseconds between sends; overrides the campaign's paceMs (default 1000). */
	paceMs?: number;
	quiet?: boolean;
	/**
	 * Test seam for the email transport. Production never sets it.
	 *
	 * The suite has to exercise the real send loop — state, resume, the daily
	 * cap, failure recording — without a live MailerSend call, because the only
	 * alternative is aiming that loop at the real audience. Swapping just the
	 * delivery call is what makes the loop testable without risking a blast.
	 * SMS needs no equivalent seam: Bird's dry-run is a product feature, so the
	 * SMS loop is exercised through the transport it really has.
	 */
	emailSend?: (mail: { to: string; subject: string }) => Promise<void>;
};

/** Visible banner marking an operator test email (not logged in campaign state). */
const TEST_BANNER =
	'<div style="background-color:#fff8e1;border:1px solid #e6c860;border-radius:6px;padding:10px 14px;margin:0 0 16px;font-family:sans-serif;font-size:13px;color:#7a5c00">ΔΟΚΙΜΑΣΤΙΚΟ EMAIL — προεπισκόπηση των δεδομένων του πρώτου παραλήπτη. Δεν εστάλη σε σπουδαστή.</div>';

async function sendTestMail(cfg: CampaignConfig, recipient: CampaignRecipient, to: string, attachment: boolean) {
	await mailService(
		{
			to,
			subject: `TEST — ${cfg.subject}`,
			htmlTemplateName: cfg.htmlTemplateName,
			plainTextTemplateName: cfg.plainTextTemplateName,
			templateData: recipient.templateData,
			attachments: cfg.getAttachments && attachment ? await cfg.getAttachments() : undefined,
		},
		{ htmlPrefix: TEST_BANNER },
	);
	const name = `${recipient.templateData.first_name ?? ""} ${recipient.templateData.last_name ?? ""}`.trim();
	console.log(`Test email sent to ${to} (data of first recipient: ${name || recipient.email})`);
}

/** Where an SMS run's body comes from: the campaign's compiled template, or an ad-hoc --sms-message. */
type SmsBodySource = { kind: "inline"; text: string } | { kind: "template"; spec: SmsCampaignConfig };

/**
 * Picks the SMS copy for this run, preferring an explicit `--sms-message` so an
 * operator can send a one-off notice without first authoring a component.
 *
 * There is deliberately no fallback to the campaign's email template: an email
 * is an order of magnitude longer than an SMS, and rendering it into a body
 * that Bird would reject at 12 segments helps nobody. The error names both ways
 * out instead.
 *
 * Exported so the CLI can call it before the (slow) D1 query rather than after.
 */
export function resolveSmsSource(cfg: CampaignConfig, smsMessage?: string): SmsBodySource {
	if (smsMessage) return { kind: "inline", text: smsMessage };
	if (cfg.sms) return { kind: "template", spec: cfg.sms };
	throw new Error(
		`Campaign "${cfg.id}" has no SMS copy. Add an sms block to its CampaignConfig (see render/sms/ and ` +
			`src/campaign/campaigns.ts), or send an ad-hoc body with --sms-message "..." ({{placeholders}} are ` +
			`substituted per recipient).`,
	);
}

/** Renders one recipient's body from whichever source this run uses. */
async function renderSmsBody(source: SmsBodySource, recipient: CampaignRecipient): Promise<string> {
	if (source.kind === "inline") {
		// The ad-hoc path gets the same completeness check as a compiled template:
		// an operator typing {{first_name}} should hear about a recipient it cannot
		// fill, not send a message with a gap in it.
		assertPlaceholdersFilled(source.text, recipient.templateData, "--sms-message");
		return applyToTemplate(source.text, recipient.templateData).trim();
	}
	return renderSmsText({ smsTemplateName: source.spec.templateName, templateData: recipient.templateData });
}

/** Bird tags accept ASCII [A-Za-z0-9_-] only, so a campaign id is made safe before use. */
function sanitizeTag(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
}

export type CollectedRecipients = {
	recipients: CampaignRecipient[];
	/** How many rows the selected channel cannot reach (e.g. no mobile number on file). */
	skippedNoAddress: number;
};

/**
 * Fetches recipients, applies the blocklists and dedupes by the ADDRESS OF THE
 * SELECTED CHANNEL — the email for an email run, the phone for an SMS run — so
 * two students sharing a family mobile are messaged once, not twice.
 *
 * For SMS, rows with no mobile number are dropped rather than queued: Greek
 * landlines cannot receive a text, so sending to one would fail and still be
 * billed. The count is reported so the drop is visible instead of silent.
 */
export async function collectRecipients(
	cfg: CampaignConfig,
	db: RunOptions["db"],
	channel: CampaignChannel = "email",
	limit?: number,
): Promise<CollectedRecipients> {
	const raw = await cfg.getRecipients(db);
	const allowed = channel === "sms" ? filterBlacklistedPhones(filterBlacklisted(raw)) : filterBlacklisted(raw);
	const seen = new Set<string>();
	const recipients: CampaignRecipient[] = [];
	let dupes = 0;
	let noAddress = 0;
	for (const r of allowed) {
		const address = channel === "sms" ? r.phone : r.email;
		if (!address) {
			noAddress++;
			continue;
		}
		const key = address.toLowerCase();
		if (seen.has(key)) {
			dupes++;
			const shown = channel === "sms" ? maskPhone(address) : address;
			console.warn(`Skipping duplicate ${channel === "sms" ? "phone" : "email"} (appears for multiple students): ${shown}`);
			continue;
		}
		seen.add(key);
		recipients.push(r);
		if (limit !== undefined && recipients.length >= limit) break;
	}
	if (dupes > 0) console.warn(`${dupes} duplicate ${channel === "sms" ? "phone number" : "email"}(s) skipped`);
	return { recipients, skippedNoAddress: noAddress };
}

export async function runCampaign(cfg: CampaignConfig, collected: CollectedRecipients, opts: RunOptions): Promise<CampaignSummary> {
	return opts.channel === "sms" ? runSmsCampaign(cfg, collected, opts) : runEmailCampaign(cfg, collected, opts);
}

async function runEmailCampaign(cfg: CampaignConfig, collected: CollectedRecipients, opts: RunOptions): Promise<CampaignSummary> {
	const recipients = collected.recipients;
	const paceMs = opts.paceMs ?? cfg.paceMs ?? 1000;
	const dailyCap = cfg.dailyCap ?? 900;
	const quiet = opts.quiet ?? false;

	if (opts.mode === "dry") {
		const previewCount = opts.previewCount ?? 1;
		const previewFiles: string[] = [];
		await mkdir(outDir(), { recursive: true });
		const samples = recipients.slice(0, previewCount);
		for (const [i, sample] of samples.entries()) {
			const html = await renderMailHtml({
				to: sample.email,
				subject: cfg.subject,
				htmlTemplateName: cfg.htmlTemplateName,
				templateData: sample.templateData,
			});
			const file = path.join(outDir(), `${cfg.id}-preview-${i + 1}.html`);
			await writeFile(file, html, "utf8");
			previewFiles.push(file);
		}
		if (opts.testMailTo) {
			if (recipients.length === 0) console.warn("No recipients — skipping test email.");
			else await sendTestMail(cfg, recipients[0], opts.testMailTo, opts.attachment !== false);
		}
		return {
			total: recipients.length,
			skippedNoAddress: collected.skippedNoAddress,
			alreadySent: 0,
			sentNow: 0,
			failed: 0,
			pausedAtDailyCap: false,
			previewFiles,
		};
	}

	// send mode — resume from the campaign state file
	const state = await loadState(cfg.id, "email");
	const already = new Set(state.sent.map(recordKey));
	const pending = recipients.filter((r) => !already.has(r.email.toLowerCase()));

	const now = new Date();
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	let sentToday = state.sent.filter((s) => new Date(s.at).getTime() >= dayStart).length;
	console.log(`Campaign "${cfg.id}": ${pending.length} to send, ${state.sent.length} already sent, ${sentToday} sent today (cap ${dailyCap}/day)`);

	const attachments = cfg.getAttachments && opts.attachment !== false ? await cfg.getAttachments() : undefined;
	let sentNow = 0;
	let failed = 0;
	let pausedAtDailyCap = false;

	if (opts.testMailTo && pending.length > 0) {
		await sendTestMail(cfg, pending[0], opts.testMailTo, opts.attachment !== false);
	}

	for (const [i, r] of pending.entries()) {
		if (sentToday >= dailyCap) {
			pausedAtDailyCap = true;
			console.log(`Daily cap of ${dailyCap} reached — stopping. Re-run to resume after midnight.`);
			break;
		}
		if (!quiet) console.log(`[${i + 1}/${pending.length}] ${r.email}`);
		try {
			// The seam replaces ONLY the delivery call: everything around it — the
			// cap check, the pacing, what lands in state — is the real code under test.
			if (opts.emailSend) {
				await opts.emailSend({ to: r.email, subject: cfg.subject });
			} else {
				await mailService({
					to: r.email,
					subject: cfg.subject,
					htmlTemplateName: cfg.htmlTemplateName,
					plainTextTemplateName: cfg.plainTextTemplateName,
					templateData: r.templateData,
					attachments,
				});
			}
			state.sent.push({ key: r.email, email: r.email, at: new Date().toISOString() });
			sentNow++;
			sentToday++;
		} catch (e) {
			failed++;
			const message = e instanceof Error ? e.message : String(e);
			state.failed.push({ key: r.email, email: r.email, error: message, at: new Date().toISOString() });
			console.error(`  FAILED ${r.email}: ${message}`);
		}
		await saveState(state);
		await sleep(paceMs);
	}

	console.log(`Done: ${sentNow} sent, ${failed} failed, ${state.sent.length} total recorded.`);
	return {
		total: recipients.length,
		skippedNoAddress: collected.skippedNoAddress,
		alreadySent: state.sent.length - sentNow,
		sentNow,
		failed,
		pausedAtDailyCap,
		previewFiles: [],
	};
}

/**
 * SMS runs. Structurally the email path above, with three deliberate
 * differences:
 *
 * 1. Every pending body is rendered and measured BEFORE the first send. A body
 *    that busts the segment budget is a property of the copy, not of one
 *    recipient, so it should abort the run rather than fail its way through
 *    several hundred people.
 * 2. Progress is logged with a masked number (src/sms/phone.ts): a terminal
 *    log is no place for a list of students' phone numbers.
 * 3. Resume state lives in `<id>.sms.json`, so an SMS run and an email run of
 *    the same campaign never mark each other's recipients as done.
 */
async function runSmsCampaign(cfg: CampaignConfig, collected: CollectedRecipients, opts: RunOptions): Promise<CampaignSummary> {
	const recipients = collected.recipients;
	const source = resolveSmsSource(cfg, opts.smsMessage);
	const paceMs = opts.paceMs ?? cfg.sms?.paceMs ?? cfg.paceMs ?? 1000;
	const dailyCap = cfg.sms?.dailyCap ?? cfg.dailyCap ?? 900;
	const maxSegments =
		opts.smsMaxSegments ?? (source.kind === "template" ? source.spec.maxSegments : undefined) ?? DEFAULT_SMS_MAX_SEGMENTS;
	const from = source.kind === "template" ? source.spec.from : undefined;
	const category: SmsCategory = source.kind === "inline" ? opts.smsCategory ?? "marketing" : source.spec.category;
	const templateLabel = source.kind === "template" ? source.spec.templateName : "(inline --sms-message)";
	const quiet = opts.quiet ?? false;
	const tags = [
		{ name: "campaign", value: sanitizeTag(cfg.id) },
		{ name: "channel", value: "sms" },
	];

	if (opts.mode === "dry") {
		// Surface a sender misconfiguration now rather than at send time: a dry run
		// needs no sender, but discovering mid-run that BIRD_SMS_FROM is unset — or
		// is the school's Greek name, which Bird refuses — wastes the whole run.
		try {
			console.log(`  sender: ${resolveSmsFrom(from)}`);
		} catch (e) {
			console.warn(`  sender check failed: ${e instanceof Error ? e.message : String(e)}`);
		}
		const previewCount = opts.previewCount ?? 1;
		const previewFiles: string[] = [];
		await mkdir(outDir(), { recursive: true });
		for (const [i, sample] of recipients.slice(0, previewCount).entries()) {
			let text: string;
			try {
				text = await renderSmsBody(source, sample);
			} catch (e) {
				// Match send mode, which skips a recipient whose data cannot fill the
				// template rather than failing the whole run: a preview must never be
				// stricter than the send it is previewing.
				console.warn(`  preview ${i + 1} skipped: ${e instanceof Error ? e.message : String(e)}`);
				continue;
			}
			const segments = estimateSegments(text);
			const file = path.join(outDir(), `${cfg.id}-sms-preview-${i + 1}.txt`);
			await writeFile(file, text, "utf8");
			previewFiles.push(file);
			console.log(
				`  preview ${i + 1}: ${segments.count} segment(s), ${segments.characters} ${segments.encoding} chars (budget ${maxSegments})`,
			);
		}
		if (opts.testSmsTo) {
			if (recipients.length === 0) console.warn("No recipients — skipping test SMS.");
			else {
				const text = await renderSmsBody(source, recipients[0]);
				await smsService({
					to: opts.testSmsTo,
					from,
					category,
					text,
					maxSegments,
					tags,
					metadata: { campaign: cfg.id, test: true },
				});
				console.log(`Test SMS sent to ${maskPhone(opts.testSmsTo)} (data of first recipient)`);
			}
		}
		return {
			total: recipients.length,
			skippedNoAddress: collected.skippedNoAddress,
			alreadySent: 0,
			sentNow: 0,
			failed: 0,
			pausedAtDailyCap: false,
			previewFiles,
		};
	}

	// send mode — resume from the campaign's own SMS state file
	//
	// The sender is resolved ONCE, here, before anything else: an unset or invalid
	// sender is a configuration error that would otherwise fail identically for
	// every recipient and leave hundreds of junk entries in the state file. (The
	// dry run only warns, so a preview still works before the sender is set up.)
	resolveSmsFrom(from);
	const state = await loadState(cfg.id, "sms");
	const already = new Set(state.sent.map(recordKey));
	const pending = recipients.filter((r) => !already.has((r.phone ?? "").toLowerCase()));

	const now = new Date();
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	let sentToday = state.sent.filter((s) => new Date(s.at).getTime() >= dayStart).length;
	console.log(
		`Campaign "${cfg.id}" [SMS ${templateLabel}]: ${pending.length} to send, ${state.sent.length} already sent, ` +
			`${sentToday} sent today (cap ${dailyCap}/day)`,
	);

	// Pre-flight: render and measure EVERY body before anything is billed.
	//
	// Two failures are handled differently on purpose. An over-long body is a
	// property of the copy, so it aborts the whole run — sending it would fail for
	// all N recipients and burn the pacing time before anyone noticed. A missing
	// personalization value is one recipient's problem (a pupil with no
	// registration link would get a dead URL), so that recipient is recorded as
	// failed and everyone else still goes out.
	const bodies = new Map<string, string>();
	const sendable: CampaignRecipient[] = [];
	let failed = 0;
	let maxSegmentCount = 0;
	for (const r of pending) {
		const phone = r.phone as string;
		let text: string;
		try {
			text = await renderSmsBody(source, r);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			failed++;
			state.failed.push({ key: phone, phone, email: r.email, error: message, at: new Date().toISOString() });
			console.warn(`  SKIP ${maskPhone(phone)}: ${message}`);
			continue;
		}
		const segments = estimateSegments(text);
		maxSegmentCount = Math.max(maxSegmentCount, segments.count);
		if (segments.count > maxSegments) {
			throw new Error(
				`Refusing to send: the body for ${maskPhone(phone)} renders to ${segments.count} segment(s) ` +
					`(${segments.characters} ${segments.encoding} characters) but the budget is ${maxSegments}. ` +
					`Shorten the SMS copy, or raise the budget with --sms-segments.`,
			);
		}
		bodies.set(phone, text);
		sendable.push(r);
	}
	// Record the skips before the first send, so an interrupted run still knows
	// which recipients had unusable data.
	if (failed > 0) await saveState(state);
	if (sendable.length > 0) {
		console.log(`Pre-flight OK: ${sendable.length} message(s), worst case ${maxSegmentCount} segment(s) each.`);
	}

	// The email path sends its test copy in send mode as well as dry mode, so SMS
	// matches it: an operator who validates with `--send --testsms` must actually
	// receive the test, not silently get nothing and then blast the list.
	if (opts.testSmsTo && sendable.length > 0) {
		const first = sendable[0];
		await smsService({
			to: opts.testSmsTo,
			from,
			category,
			text: bodies.get(first.phone as string) as string,
			maxSegments,
			tags,
			metadata: { campaign: cfg.id, test: true },
		});
		console.log(`Test SMS sent to ${maskPhone(opts.testSmsTo)} (data of first recipient)`);
	}

	let sentNow = 0;
	let pausedAtDailyCap = false;

	for (const [i, r] of sendable.entries()) {
		const phone = r.phone as string;
		if (sentToday >= dailyCap) {
			pausedAtDailyCap = true;
			console.log(`Daily cap of ${dailyCap} reached — stopping. Re-run to resume after midnight.`);
			break;
		}
		if (!quiet) console.log(`[${i + 1}/${sendable.length}] ${maskPhone(phone)}`);
		try {
			await smsService({
				to: phone,
				from,
				category,
				text: bodies.get(phone) as string,
				maxSegments,
				tags,
				metadata: { campaign: cfg.id },
				// Stable across a resume: if the process died after Bird accepted a
				// message but before the state file recorded it, the retry replays
				// Bird's original result instead of texting the student twice.
				idempotencyKey: `${sanitizeTag(cfg.id)}-${phone.replace(/\D/g, "")}`,
			});
			state.sent.push({ key: phone, phone, email: r.email, at: new Date().toISOString() });
			sentNow++;
			sentToday++;
		} catch (e) {
			failed++;
			const message = e instanceof Error ? e.message : String(e);
			state.failed.push({ key: phone, phone, email: r.email, error: message, at: new Date().toISOString() });
			console.error(`  FAILED ${maskPhone(phone)}: ${message}`);
		}
		await saveState(state);
		await sleep(paceMs);
	}

	console.log(`Done: ${sentNow} sent, ${failed} failed, ${state.sent.length} total recorded.`);
	return {
		total: recipients.length,
		skippedNoAddress: collected.skippedNoAddress,
		alreadySent: state.sent.length - sentNow,
		sentNow,
		failed,
		pausedAtDailyCap,
		previewFiles: [],
	};
}

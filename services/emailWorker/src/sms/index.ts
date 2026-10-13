import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyToTemplate } from "../mailersend";
import { sendSms, type SendSmsResult, type SmsCategory } from "./bird";
import { estimateSegments } from "./segments";

/**
 * SMS sending for campaigns — the SMS twin of `mailService` in src/mailersend.ts.
 *
 * The message body is compiled from the React Email components in `render/sms/`
 * by `bun run templates:build`, which renders each one to plain text with
 * `@react-email/render` (`{ plainText: true }`) and writes it to
 * `sms_templates/<name>`. A send is therefore a plain file read plus the same
 * `{{placeholder}}` substitution the HTML email pipeline already uses, so a
 * campaign's SMS copy lives in the same React components as its email copy and
 * is reviewed the same way.
 *
 * Only the transport differs: Bird instead of MailerSend. MailerSend's SMS
 * coverage is North America only, so it cannot reach the school's Greek numbers.
 *
 * Rendering and sending are deliberately separate calls: the runner renders
 * every body up front to prove the whole run fits its segment budget before the
 * first message is billed.
 */
const sms_templates_dir = path.resolve(import.meta.dir, "../../sms_templates/");

/** A rendered message, ready to hand to Bird. */
export type SmsSendRequest = {
	/** Recipient in E.164 (normalise with src/sms/phone.ts). */
	to: string;
	/** Sender ID override; falls back to BIRD_SMS_FROM. */
	from?: string;
	category: SmsCategory;
	/** The final body, placeholders already substituted. */
	text: string;
	/** Segment budget for this message (Bird's own hard cap is 12). */
	maxSegments?: number;
	tags?: { name: string; value: string }[];
	metadata?: Record<string, unknown>;
	idempotencyKey?: string;
};

/** Bird accepts a sender as an owned E.164 number or an ASCII alphanumeric sender ID. */
const E164_RE = /^\+[1-9]\d{6,14}$/;
/**
 * Alphanumeric sender ID: 3–11 characters, at least one letter, drawn from
 * ASCII letters/digits/spaces/hyphens/underscores/dots, with no separator at
 * either end. Greek characters are NOT accepted by Bird — a sender such as
 * "Σχολή Βυζαντινής" is rejected, which is why the school ships an ASCII
 * sender ID and puts its full Greek name inside the message body instead.
 */
const ALPHA_SENDER_RE = /^(?=.{3,11}$)(?=.*[A-Za-z])[A-Za-z0-9](?:[A-Za-z0-9 ._-]*[A-Za-z0-9])?$/;

/**
 * Reads a compiled SMS template. Templates are local build artefacts and are
 * never fetched from the website (unlike the HTML email templates, which the
 * site also serves): nothing outside this repo ever needs an SMS body.
 */
export async function getSmsTemplate(name: string): Promise<string> {
	const file = path.join(sms_templates_dir, name);
	try {
		return await readFile(file, "utf8");
	} catch {
		throw new Error(
			`Could not read the SMS template "${name}" (${file}). Run \`bun run templates:build\` to compile render/sms/ into sms_templates/.`,
		);
	}
}

/** The distinct `{{placeholder}}` names a template references, in first-seen order. */
export function templatePlaceholders(template: string): string[] {
	return [...new Set([...template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]))];
}

/**
 * Throws when a template needs a value the recipient does not have.
 *
 * `applyToTemplate` renders a missing key as an empty string, so `{{first_name}}`
 * leaves a visible gap and `{{regid}}` produces a link that goes nowhere — while
 * still costing two billable segments. The repo's own email review flags this
 * class as a P0 for emails; for SMS it is also a silent waste of money, so this
 * refuses to render at all. The campaign runner catches it per recipient, logs
 * the masked number alongside it, and skips that recipient.
 */
export function assertPlaceholdersFilled(template: string, data: Record<string, string>, label: string): void {
	const missing = templatePlaceholders(template).filter((key) => !data[key]?.trim());
	if (missing.length === 0) return;
	throw new Error(
		`${label} needs ${missing.map((key) => `{{${key}}}`).join(", ")} but this recipient has no value for ` +
			`${missing.length === 1 ? "it" : "them"} — the message would go out with a gap (and a dead link for ` +
			`{{regid}}), so the recipient was skipped.`,
	);
}

/** Renders the final SMS body for one recipient: compiled template + `{{placeholder}}` substitution. */
export async function renderSmsText(data: {
	smsTemplateName: string;
	templateData: Record<string, string>;
}): Promise<string> {
	const template = await getSmsTemplate(data.smsTemplateName);
	assertPlaceholdersFilled(template, data.templateData, `SMS template "${data.smsTemplateName}"`);
	return applyToTemplate(template, data.templateData).trim();
}

/**
 * Resolves the sender the recipient sees. Explicit config wins so a single
 * campaign can send from a different identity; otherwise BIRD_SMS_FROM.
 *
 * Fails loudly on a sender Bird will refuse, because the alternative is a
 * campaign that dies one rejected message at a time — and because the most
 * likely mistake (a Greek school name as the sender) is not obvious from
 * Bird's error alone.
 */
export function resolveSmsFrom(from?: string): string {
	const resolved = (from ?? process.env.BIRD_SMS_FROM ?? "").trim();
	if (!resolved) {
		throw new Error(
			"No SMS sender configured. Set BIRD_SMS_FROM (e.g. BYZSCHOOL) in your env file, or set sms.from on the campaign.",
		);
	}
	if (E164_RE.test(resolved)) return resolved;
	if (ALPHA_SENDER_RE.test(resolved)) return resolved;
	throw new Error(
		`Invalid SMS sender "${resolved}". Bird accepts either an E.164 number your workspace owns, or an ` +
			`alphanumeric sender ID of 3–11 ASCII characters containing at least one letter (letters, digits, ` +
			`spaces, ".", "_" and "-" only, and no separator at either end). Greek characters cannot be used — ` +
			`senders like "Σχολή Βυζαντινής" are rejected, so use an ASCII ID such as "BYZSCHOOL" and keep the ` +
			`school's full name in the message text.`,
	);
}

/**
 * Sends one already-rendered SMS.
 *
 * The segment check lives here rather than at build time because
 * `{{first_name}}` and friends change length per recipient — a body that fits
 * for "Άννα" may not fit for "Χριστοδουλόπουλος" — and because Bird rejects an
 * over-cap body with a 422 instead of truncating it.
 */
export async function smsService(request: SmsSendRequest): Promise<SendSmsResult> {
	const segments = estimateSegments(request.text);
	const cap = request.maxSegments;
	if (cap !== undefined && segments.count > cap) {
		throw new Error(
			`SMS body needs ${segments.count} ${segments.encoding} segment(s) (${segments.characters} billable ` +
				`characters) but the campaign allows ${cap}. Shorten the message — Greek is UCS-2, so only 67 ` +
				`characters fit in each segment of a multi-part SMS.`,
		);
	}
	return sendSms({
		to: request.to,
		from: resolveSmsFrom(request.from),
		text: request.text,
		category: request.category,
		tags: request.tags,
		metadata: request.metadata,
		idempotencyKey: request.idempotencyKey,
	});
}

export { estimateSegments };
export type { SendSmsResult, SmsCategory };

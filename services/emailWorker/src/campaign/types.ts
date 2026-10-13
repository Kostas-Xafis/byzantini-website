import type { Attachment } from "mailersend";
import type { DefaultTemplateData } from "../../types/templates";
import type { SmsCategory } from "../sms/bird";

export type DBKind = "sqlite-prod" | "sqlite-dev";

/** A campaign run targets one channel at a time unless `--channel both` is passed. */
export type CampaignChannel = "email" | "sms";

export type CampaignRecipient = {
	email: string;
	/**
	 * E.164 phone number (see src/sms/phone.ts), present only when the source
	 * row actually has a usable one. Returning-student recipients come from the
	 * legacy `email_subscriptions` list, which carries no phone numbers at all,
	 * so those campaigns cannot be sent by SMS.
	 */
	phone?: string;
	/** Every campaign template must provide the unsubscribe token; extra keys are per-template. */
	templateData: DefaultTemplateData & Record<string, string>;
};

/**
 * SMS settings for a campaign. A campaign without this block cannot be run with
 * `--sms` unless the operator supplies a one-off body with `--sms-message`:
 * there is deliberately no fallback to the email template, because an email is
 * an order of magnitude longer than an SMS.
 */
export type SmsCampaignConfig = {
	/** Built template relative to sms_templates/, e.g. "2026/google_review.sms.txt". */
	templateName: string;
	/** Why the message is being sent — Bird requires it and carriers use it for compliance. */
	category: SmsCategory;
	/** Sender ID for this campaign; falls back to BIRD_SMS_FROM. */
	from?: string;
	/** Segment budget for one message (Bird's hard cap is 12). Greek text bills 67 chars/segment. */
	maxSegments?: number;
	/** Delay between SMS sends in ms; falls back to the campaign's paceMs. */
	paceMs?: number;
	/** Max SMS per calendar day; falls back to the campaign's dailyCap. */
	dailyCap?: number;
};

export type CampaignConfig = {
	/** Unique campaign id, also used for the resume state file name. */
	id: string;
	title: string;
	subject: string;
	/** Template path relative to email/html_templates/, e.g. "2026/upenthimisi_eggrafis.html". */
	htmlTemplateName: string;
	/** Optional plain-text template relative to email/text_templates/ (multipart alternative). */
	plainTextTemplateName?: string;
	getRecipients: (db: DBKind) => Promise<CampaignRecipient[]>;
	getAttachments?: () => Promise<Attachment[]>;
	/** SMS variant of this campaign. Omit when the campaign has no SMS copy. */
	sms?: SmsCampaignConfig;
	/** Delay between sends in ms (default 1000 — MailerSend paces ~1 msg/sec). */
	paceMs?: number;
	/** Max emails per calendar day (default 900, under the 1,000/day API limit). */
	dailyCap?: number;
};

export type CampaignSummary = {
	total: number;
	/** Recipients dropped because the channel has no usable address for them. */
	skippedNoAddress: number;
	alreadySent: number;
	sentNow: number;
	failed: number;
	pausedAtDailyCap: boolean;
	previewFiles: string[];
};

/** Segment budget used when a campaign defines no `sms.maxSegments`. */
export const DEFAULT_SMS_MAX_SEGMENTS = 3;

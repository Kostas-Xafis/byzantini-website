import type { ReactElement } from "react";
import { RenewalSms } from "./RenewalSms";
import { GoogleReviewSms } from "./GoogleReviewSms";
import { TeachersSms } from "./TeachersSms";

export type SmsTemplateDef = {
	/** Output path relative to sms_templates/, e.g. "2026/upenthimisi_eggrafis.sms.txt". */
	name: string;
	/** Builds the SMS element with {{placeholder}} values as literal props. */
	build: () => ReactElement;
};

/**
 * Registry of React Email components rendered to plain text for SMS
 * campaigns, mirroring `templates` in render/index.tsx. Each entry is built
 * with literal {{placeholder}} props, so the compiled .sms.txt keeps working
 * with the same per-recipient substitution pipeline as the email templates.
 *
 * Plain text, not HTML: SMS is billed per 67-character UCS-2 segment for
 * Greek, so the output of every component here is one short line and nothing
 * else — no styling, no links, no wrapping markup.
 */
export const smsTemplates: SmsTemplateDef[] = [
	{
		name: "2026/upenthimisi_eggrafis.sms.txt",
		build: () => <RenewalSms first_name={"{{first_name}}"} regid={"{{regid}}"} />,
	},
	{
		name: "2026/google_review.sms.txt",
		build: () => <GoogleReviewSms first_name={"{{first_name}}"} />,
	},
	{
		name: "2026/upenthimisi_eggrafis_kathigites.sms.txt",
		build: () => <TeachersSms greeting={"{{greeting}}"} />,
	},
];

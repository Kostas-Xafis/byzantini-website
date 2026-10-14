import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import type { DefaultMailData } from "../types/templates";
import { appendFile } from "fs/promises";
import { removeKey } from "./utils";

import path from "node:path";
// Template dirs are relative to this file (the folder moved into services/emailWorker).
const templates_dir = path.resolve(import.meta.dir, "../html_templates/") + "/";
const text_templates_dir = path.resolve(import.meta.dir, "../text_templates/") + "/";

/** HTML templates are the locally built files (`bun run templates:build`) — the CLI never fetches them from the site. */
const getHTMLTemplate = async (data: DefaultMailData) => {
	try {
		const templateBuffer = await fetch(`file://${templates_dir}${data.htmlTemplateName}`).then(res => res.arrayBuffer());
		return new TextDecoder().decode(templateBuffer);
	} catch (e) {
		throw new Error(`Could not fetch the provided name of the HTML template (${data.htmlTemplateName}) from local file system.`);
	}
};

/** Plain-text alternative templates are campaign-local files (never fetched from the site). */
const getTextTemplate = async (name: string) => {
	try {
		const buffer = await fetch(`file://${text_templates_dir}${name}`).then((res) => res.arrayBuffer());
		return new TextDecoder().decode(buffer);
	} catch (e) {
		console.warn(`Could not fetch plain-text template ${name} — sending HTML only.`);
		return null;
	}
};

/**
 * Substitutes `{{ key }}` placeholders with values from `data`.
 *
 * Typed against a plain string map rather than the email template data shape so
 * the SMS pipeline can share it: an SMS body has no unsubscribe token and no
 * business being forced to pretend it has one. Missing keys render empty, which
 * is what the email side has always relied on.
 */
const applyToTemplate = (template: string, data: Record<string, string>) => {
	const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
	return template.replace(regex, (_, match) => data[match] || "");
};

export { applyToTemplate };

/** Renders the final email HTML for the given data (local template source) — used for previews. */
export async function renderMailHtml(mailData: DefaultMailData) {
	return applyToTemplate(await getHTMLTemplate(mailData), mailData.templateData);
}

export const mailService = async <T extends DefaultMailData = DefaultMailData>(
	mailData: Partial<T>,
	opts?: { htmlPrefix?: string },
) => {
	const { MAILERSEND_API_KEY } = process.env;

	if (!MAILERSEND_API_KEY) {
		throw new Error("No MailerSend API key provided");
	} else if (mailData === undefined) {
		throw new Error("No mail data provided");
	} else if (mailData?.to === undefined) {
		throw new Error("No recipient provided");
	} else if (mailData?.subject === undefined) {
		throw new Error("No subject provided");
	} else if (mailData?.htmlTemplateName === undefined) {
		throw new Error("No HTML template name provided");
	}

	try {
		let tempData = JSON.parse(JSON.stringify(mailData));
		// Only strip attachment payload fields when attachments are present — otherwise
		// removeKey throws and every attachment-less email fails before sending.
		if (tempData.attachments) {
			removeKey(tempData, "attachments.content");
			removeKey(tempData, "attachments.disposition");
		}
		// Logging is best-effort and must never block a send (local file trail).
		// Never log the authToken — it is a shared secret.
		const { authToken: _authToken, ...logData } = tempData;
		const logBody = `Sending email: ${JSON.stringify(logData, null, 2)}`;
		try {
			await appendFile("mail_log.txt", `${logBody}\n`);
		} catch (e) {
			console.warn(`Could not write mail_log.txt: ${e}`);
		}

		let htmlTemplate = applyToTemplate(await getHTMLTemplate(mailData as T), (mailData as T).templateData);
		if (opts?.htmlPrefix) htmlTemplate = opts.htmlPrefix + htmlTemplate;
		const mailerSend = new MailerSend({
			apiKey: MAILERSEND_API_KEY,
		});

		const sentFrom = new Sender("no-reply@musicschool-metamorfosi.gr", "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής");

		const recipientObj = new Recipient(mailData.to);
		const emailParams = new EmailParams()
			.setFrom(sentFrom)
			.setTo([recipientObj])
			.setReplyTo(sentFrom)
			.setSubject(mailData.subject)
			.setAttachments(mailData.attachments || [])
			.setHtml(htmlTemplate);

		// Deliverability: multipart alternative (plain text) so filters see a
		// text/plain part next to the HTML. One-click List-Unsubscribe headers are
		// NOT set here: mailersend rejects `list_unsubscribe` on the Hobby plan
		// (#MS42235) — enable "Track unsubscribe" in the MailerSend domain settings
		// on a qualifying plan instead. The visible footer link always stays.
		if (mailData.plainTextTemplateName) {
			const textTemplate = await getTextTemplate(mailData.plainTextTemplateName);
			if (textTemplate) emailParams.setText(applyToTemplate(textTemplate, (mailData as T).templateData));
		}

		await mailerSend.email.send(emailParams);
	} catch (e) {
		throw new Error(`Failed to send email: ${e}`);
	}
};

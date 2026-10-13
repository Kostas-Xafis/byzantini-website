import type { Attachment } from "mailersend";
import { toBase64 } from "../utils";

/** Builds a MailerSend attachment from a public URL (e.g. the poster on the website). */
export async function urlAttachment(url: string, filename: string): Promise<Attachment> {
	return {
		content: await toBase64(url),
		filename,
		disposition: "attachment",
	};
}

/** Builds a MailerSend attachment from a local file path. */
export async function localFileAttachment(filePath: string, filename?: string): Promise<Attachment> {
	return {
		content: await toBase64(filePath),
		filename: filename ?? filePath.split("/").pop() ?? "attachment",
		disposition: "attachment",
	};
}

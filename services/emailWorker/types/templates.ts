import type { Attachment } from "mailersend";

export type DefaultTemplateData = {
	token: string;
};

export type DefaultMailData<T extends DefaultTemplateData = DefaultTemplateData> = {
	to: string;
	subject: string;
	htmlTemplateName: string;
	/** Optional plain-text template (relative to email/text_templates/); adds a multipart alternative. */
	plainTextTemplateName?: string;
	attachments?: Attachment[];
	templateData: T;
};

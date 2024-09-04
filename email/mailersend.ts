import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { createDbConnection } from "./db";
import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
export interface Env {
	BUCKET: R2Bucket;
	MAILERSEND_API_KEY: string;
}

type MailData = {
	to: string;
	subject: string;
	htmlTemplateName: string;
};

const getMailingData = async (mail: string) => {
	const conn = createDbConnection("sqlite-prod");
	// let emails = (
	// 	await conn.execute(
	// 		"SELECT * FROM email_subscriptions WHERE NOT unrelated AND email NOT IN (SELECT email FROM teachers)",
	// 	)
	// ).rows as any as { email: string; unsubscribe_token: string; }[];
	let emails = (await conn.execute(
		{
			sql: "SELECT * FROM email_subscriptions WHERE email=?",
			args: [mail]
		}
	)).rows as any as { email: string; unsubscribe_token: string; }[];

	return emails[0];
};


const getHTMLTemplate = async (env: Env, data: MailData) => {
	const templateBuffer =
		await (await env.BUCKET.get(data.htmlTemplateName) as R2ObjectBody).arrayBuffer()
		;
	return new TextDecoder().decode(templateBuffer);
};

const mailService = async (env: Env, mailData: MailData) => {

	const mailerSend = new MailerSend({
		apiKey: env.MAILERSEND_API_KEY,
	});

	const sentFrom = new Sender("no-reply@musicschool-metamorfosi.gr", "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής Μεταμόρφωσης");

	// const mailingData = await getMailingData(mailData.to);

	const htmlTemplate = await getHTMLTemplate(env, mailData);
	const recipientObj = new Recipient(mailData.to);
	const emailParams = new EmailParams()
		.setFrom(sentFrom)
		.setTo([recipientObj])
		.setReplyTo(sentFrom)
		.setSubject(mailData.subject)
		.setHtml(htmlTemplate);

	await mailerSend.email.send(emailParams);
};



export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "*",
		};

		if (req.method === "OPTIONS") {
			function handleOptions(request: Request) {
				if (request.headers.get("Origin") !== null &&
					request.headers.get("Access-Control-Request-Method") !== null &&
					request.headers.get("Access-Control-Request-Headers") !== null) {
					// Handle CORS pre-flight request.
					return new Response(null, {
						headers: corsHeaders
					});
				} else {
					// Handle standard OPTIONS request.
					return new Response(null, {
						headers: {
							"Allow": "GET, HEAD, POST, OPTIONS",
						}
					});
				}
			}
			return handleOptions(req);
		}

		if (req.method === "POST") {
			const body = await req.json();
			await mailService(env, body as any);
			return new Response("Success", {
				status: 200,
				headers: corsHeaders,
			});
		}

		return new Response("Invalid request", { status: 400 });
	},
};

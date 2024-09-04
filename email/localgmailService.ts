import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { authenticate } from "@google-cloud/local-auth";
import { MailComposer } from "nodemailer/lib/mail-composer";
import { createDbConnection } from "./db.ts";
import { OAuth2Client, auth } from "google-auth-library";
import { gmail } from "googleapis/build/src/apis/gmail/index";
import MimeNode from "nodemailer/lib/mime-node/index.js";

// https://www.labnol.org/google-api-service-account-220405 ❤️
const SCOPES = [
	"https://mail.google.com/",
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.compose",
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/gmail.insert"
];
const TOKEN_PATH = path.join(process.cwd(), "./token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "./credentials.json");
(async () => {
	const conn = createDbConnection("sqlite-prod");
	/**
	 * Reads previously authorized credentials from the save file.
	 *
	 * @return {Promise<OAuth2Client|null>}
	 */
	async function loadSavedCredentialsIfExist() {
		try {
			const content = await fsp.readFile(TOKEN_PATH, { encoding: "utf-8" });
			const credentials = JSON.parse(content);
			return auth.fromJSON(credentials);
		} catch (err) {
			return null;
		}
	}

	/**
	 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
	 *
	 * @param {OAuth2Client} client
	 * @return {Promise<void>}
	 */
	async function saveCredentials(client: OAuth2Client) {
		const content = await fsp.readFile(CREDENTIALS_PATH, { encoding: "utf-8" });
		const keys = JSON.parse(content);
		const key = keys.installed || keys.web;
		const payload = JSON.stringify({
			type: "authorized_user",
			client_id: key.client_id,
			client_secret: key.client_secret,
			refresh_token: client.credentials.refresh_token
		});
		await fsp.writeFile(TOKEN_PATH, payload);
	}

	/**
	 * Load or request or authorization to call APIs.
	 *
	 */
	async function authorize() {
		let client = await loadSavedCredentialsIfExist();
		if (client) return client;

		let oauth_client = await authenticate({
			scopes: SCOPES,
			keyfilePath: CREDENTIALS_PATH
		});
		if (oauth_client.credentials) {
			await saveCredentials(oauth_client as any);
		}
		return oauth_client;
	}

	const encodeMessage = (message: string) => {
		return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	};

	const createMail = async options => {
		const mailComposer = new MailComposer(options);
		//@ts-ignore
		const message = await (mailComposer.compile() as MimeNode).build();
		return encodeMessage(message);
	};

	// let emails = (
	// 	await conn.execute(
	// 		"SELECT * FROM email_subscriptions WHERE NOT unrelated AND email NOT IN (SELECT email FROM teachers)",
	// 	)
	// ).rows as any as { email: string; unsubscribe_token: string; }[];
	// let emails = (await conn.execute(
	// 	{
	// 		sql: "SELECT * FROM email_subscriptions WHERE email=?",
	// 		args: ["koxafis@gmail.com"]
	// 	}
	// )).rows as any as { email: string; unsubscribe_token: string; }[];
	// console.log(emails);

	let html = await fsp.readFile("./templates/seminario-aug-2024.html", { encoding: "utf-8" });
	// @ts-ignore
	const _gmail = gmail({ version: "v1", auth: await authorize() });
	let i = 0;
	for (const email of emails) {
		const opts = {
			to: email.email,
			from: "byzscholemousikhs@gmail.com",
			subject: "Σεμινάριο Βυζαντινής Μουσικής"
		} as any;
		try {
			opts.html = email.unsubscribe_token ? html : html.replace("{{token}}", email.unsubscribe_token);
			// await fetch("https://gmail.googleapis.com/upload/gmail/v1/users/byzscholemousikhs@gmail.com/messages/send", {
			// 	method: "POST"
			// });
			_gmail.users.messages.attachments;
			_gmail.users.messages
				.send({
					userId: "byzscholemousikhs@gmail.com",
					requestBody: {
						raw: await createMail(opts)
					}
				})
				.then(res => {
					i++;
					console.log(`Progress: ${i}/${emails.length}\t: Sent email to: ${email.email}\t: ${res.status}--${res.statusText}`);
					fs.appendFileSync("./sentEmails.txt", `Progress: ${i}/${emails.length}\t Sent email to: ${email.email}\n`);
					fs.appendFileSync("./sentEmails.txt", `${res.status} ${res.statusText}\n`);
				})
				.catch(err => {
					i++;
					console.error(err);
					fs.appendFileSync("./failedEmails.txt", `${email.email}\n`);
				});
			await new Promise(resolve => setTimeout(resolve, 1750));
		} catch (e) {
			i++;
			console.error(e);
			await fsp.appendFile("./failedEmails.txt", `${email.email}\n`);
		}
	}
})();

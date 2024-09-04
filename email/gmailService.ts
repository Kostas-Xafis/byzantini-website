const mailService = async () => {

	// @ts-ignore
	let _gmail = gmail({ version: "v1", auth: await authorize() });
	// _gmail.context.google;
	console.log({ google: _gmail.context.google });
	let html = await fsp.readFile("./templates/seminario-aug-2024.html", { encoding: "utf-8" });
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
};

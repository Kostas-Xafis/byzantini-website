import type { EmailSubscriptions, Registrations } from "../../types/entities";
import { RegistrationsRoutes } from "./registrations.client";
import { execTryCatch, executeQuery, questionMarks, generateLink } from "../utils.server";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(RegistrationsRoutes)) as typeof RegistrationsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Registrations>("SELECT * FROM registrations"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [registration] = await executeQuery<Registrations>("SELECT * FROM registrations WHERE id = ?", ids);
		if (!registration) throw Error("Registration not found");
		return registration;
	});
};

serverRoutes.getTotal.func = async _ctx => {
	return await execTryCatch(async () => (await executeQuery<{ total: number; }>("SELECT amount AS total FROM total_registrations"))[0]);
};

serverRoutes.post.func = async (ctx) => {
	return await execTryCatch(async T => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		await T.executeQuery(
			`INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, class_id, teacher_id, instrument_id, date) VALUES (${questionMarks(args)})`,
			args
		);
		await T.executeQuery("UPDATE total_registrations SET amount = amount + 1");
		const isSubscribed = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
		if (isSubscribed.length === 0) await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, generateLink(16)]);

		return "Registrated successfully";
	});
};

serverRoutes.update.func = async (ctx) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		args.push(args.shift() as any); // Remove the id from the arguments and push it at the end
		await executeQuery(`UPDATE registrations SET am=?, last_name=?, first_name=?, fathers_name=?, telephone=?, cellphone=?, email=?, birth_date=?, road=?, number=?, tk=?, region=?, registration_year=?, class_year=?, class_id=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, total_payment=?, payment_date=? WHERE id=?`, args);
		return "Registration updated successfully";
	});
};

serverRoutes.delete.func = async (ctx) => {
	return await execTryCatch(async (T) => {
		const body = await ctx.request.json();
		if (body.length === 1) await T.executeQuery(`DELETE FROM registrations WHERE id=?`, body);
		else await T.executeQuery(`DELETE FROM registrations WHERE id IN (${questionMarks(body)})`, body);
		await T.executeQuery("UPDATE total_registrations SET amount = amount - ?", [body.length]);
		return "Registration completed successfully";
	});
};

serverRoutes.emailSubscribe.func = async (ctx) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		await executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, generateLink(16)]);
		return "Email subscribed successfully";
	});
};

serverRoutes.emailUnsubscribe.func = async (ctx) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const isSubscribed = await executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE unsubscribe_token=?", [body.token]);
		if (isSubscribed.length === 0) return { isValid: false };
		await executeQuery("DELETE FROM email_subscriptions WHERE unsubscribe_token=?", [body.token]);
		return { isValid: true };
	});
};

serverRoutes.getSubscriptionToken.func = async (ctx) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const [isSubscribed] = await executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
		if (!isSubscribed) return { token: null };
		return { token: isSubscribed.unsubscribe_token };
	});
};

export const RegistrationsServerRoutes = serverRoutes;

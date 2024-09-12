import type { EmailSubscriptions, Registrations } from "../../types/entities";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, generateLink, getUsedBody, questionMarks } from "../utils.server";
import { RegistrationsRoutes } from "./registrations.client";


// Include this in all .server.ts files
const serverRoutes = deepCopy(RegistrationsRoutes); // Copy the routes object to split it into client and server routes

const { PROD } = import.meta.env;

serverRoutes.get.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(() => {
		if (PROD) {
			return executeQuery<Registrations>("SELECT * FROM registrations WHERE registration_year LIKE '2024-2025'");
		}
		return executeQuery<Registrations>("SELECT * FROM registrations");

		// const { year } = slug;
		// return executeQuery<Registrations>("SELECT * FROM registrations");
		// return executeQuery<Registrations>("SELECT * FROM registrations WHERE registration_year LIKE ?", [`${year}-${year + 1}`]);
	});
};

serverRoutes.getById.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const id = slug.id;
		const [registration] = await executeQuery<Registrations>("SELECT * FROM registrations WHERE id = ?", [id]);
		if (!registration) throw Error("Registration not found");
		return registration;
	});
};

serverRoutes.getByReregistrationId.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const id = slug.id;
		const [registration] = await executeQuery<Registrations>("SELECT * FROM registrations WHERE registration_url = ?", [id]);
		if (!registration) throw Error("Registration not found");
		return registration;
	});
};

serverRoutes.getTotal.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => (await executeQuery<{ total: number; }>("SELECT amount AS total FROM total_registrations"))[0]);
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = Object.values(body);
		await T.executeQuery(
			`INSERT INTO registrations (last_name, first_name, am, amka, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, class_id, teacher_id, instrument_id, date, pass) VALUES (${questionMarks(args)})`,
			args
		);
		await T.executeQuery("UPDATE total_registrations SET amount = amount + 1");
		let mail_subscription = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
		if (mail_subscription.length === 0) {
			mail_subscription = [{ email: body.email, unsubscribe_token: generateLink(16), unrelated: false }];
			await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, generateLink(16)]);
		}

		if (PROD) {
			// Send automated email to the student for the successful registration
			const {
				AUTOMATED_EMAILS_SERVICE_URL: service_url,
				AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN: authToken
			} = import.meta.env;
			if (!service_url || !authToken) throw Error("Unauthorized access to the email service");
			await fetch(service_url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					authToken,
					to: mail_subscription[0].email,
					subject: "Επιτυχής εγγραφή",
					htmlTemplateName: "epitixis_eggrafi.html",
					templateData: { token: mail_subscription[0].unsubscribe_token }
				})
			});
		}

		return "Registrated successfully";
	});
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = Object.values(body);
		args.push(args.shift() as any); // Remove the id from the arguments and push it at the end
		await T.executeQuery(`UPDATE registrations SET am=?, last_name=?, first_name=?, fathers_name=?, telephone=?, cellphone=?, email=?, birth_date=?, road=?, number=?, tk=?, region=?, registration_year=?, class_year=?, class_id=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, total_payment=?, payment_date=?, pass=? WHERE id=?`, args);
		return "Registration updated successfully";
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		if (body.length === 1) await T.executeQuery(`DELETE FROM registrations WHERE id=?`, body);
		else await T.executeQuery(`DELETE FROM registrations WHERE id IN (${questionMarks(body)})`, body);
		await T.executeQuery("UPDATE total_registrations SET amount = amount - ?", [body.length]);

		return "Registration deleted successfully";
	});
};

serverRoutes.emailSubscribe.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, generateLink(16)]);
		return { subscribed: true };
	});
};

serverRoutes.emailUnsubscribe.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const isSubscribed = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE unsubscribe_token=?", [body.token]);
		if (isSubscribed.length === 0) return { isValid: false };
		await T.executeQuery("DELETE FROM email_subscriptions WHERE unsubscribe_token=?", [body.token]);
		return { isValid: true };
	});
};

serverRoutes.getSubscriptionToken.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const [isSubscribed] = await executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
		if (!isSubscribed) return { token: null };
		return { token: isSubscribed.unsubscribe_token };
	});
};

export const RegistrationsServerRoutes = serverRoutes;

import { z } from "astro/zod";
import type { EmailSubscriptions, Registrations } from "@_types/entities";
import { executeQuery, isProduction } from "@lib/utils.server";
import { Random as R } from "@lib/random";
import { z_Registrations, z_RegistrationsResponse } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Registrations — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/registrations.client|server.ts.
 *
 * Route keys mirror the old `RegistrationsRoutes` so the app components keep
 * working: get, getById, getByReregistrationUrl, getTotal, getTotalByYear,
 * getYears, post, update, delete, emailSubscribe, emailUnsubscribe,
 * getSubscriptionToken.
 */

// class_type ids: 0 = Βυζαντινή Μουσική, 1 = Παραδοσιακή Μουσική, 2 = Ευρωπαϊκή Μουσική.
const CLASS_TYPE_BYZANTINE = 0;
const CLASS_TYPE_TRADITIONAL = 1;
const CLASS_TYPE_EUROPEAN = 2;

// "Επιτυχής εγγραφή" email variants, one static HTML template per class level
// (built from email/render/emails/SuccessfulRegistration.tsx). The email is
// broken down at the 2nd (Βυζαντινή Μουσική) and 3rd (Παραδοσιακή & Ευρωπαϊκή)
// bullet groups so each student only receives the instructions that apply to
// their department / year.
const successfulRegistrationTemplates = {
	default: "epitixis/epitixis_eggrafi.html",
	byzantineDefault: "epitixis/epitixis_eggrafi_byzantine.html",
	byzantineE: "epitixis/epitixis_eggrafi_byzantine_e.html",
	byzantineBDiploma: "epitixis/epitixis_eggrafi_byzantine_b_diploma.html",
	traditionalDefault: "epitixis/epitixis_eggrafi_traditional.html",
	traditionalBAnotera: "epitixis/epitixis_eggrafi_traditional_b_anotera.html",
	traditionalBDiploma: "epitixis/epitixis_eggrafi_traditional_b_diploma.html",
} as const;

function successfulRegistrationTemplate(classId: number, classYear: string): string {
	if (classId === CLASS_TYPE_BYZANTINE) {
		if (classYear === "Ε' Ετος") return successfulRegistrationTemplates.byzantineE;
		if (classYear === "Β' Ετος Διπλώματος") return successfulRegistrationTemplates.byzantineBDiploma;
		return successfulRegistrationTemplates.byzantineDefault;
	}
	if (classId === CLASS_TYPE_TRADITIONAL || classId === CLASS_TYPE_EUROPEAN) {
		if (classYear === "Β' Ανωτέρα") return successfulRegistrationTemplates.traditionalBAnotera;
		if (classId === CLASS_TYPE_TRADITIONAL && classYear === "Β' Διπλώματος") return successfulRegistrationTemplates.traditionalBDiploma;
		return successfulRegistrationTemplates.traditionalDefault;
	}
	return successfulRegistrationTemplates.default;
}

// ---- Group-specific request schemas (kept inside this file) ----
const postReq = z_Registrations.omit({ id: true, payment_date: true, payment_amount: true, total_payment: true });

const z_IdArray = z.array(z.number().int().min(0, "Μη έγκυρο id"));

const z_Email = z.object({ email: z.string() });
const z_EmailToken = z.object({ token: z.string() });

const z_InsertResponse = z.object({ insertId: z.number().int().min(0, "Μη έγκυρο insertId") });

export const registrationsRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/registrations/[year:number]", responseSchema: z.array(z_RegistrationsResponse) },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(
				() => executeQuery<Registrations>("SELECT * FROM registrations WHERE registration_year LIKE ?", [`${params.year}-${Number(params.year) + 1}`]),
				"Σφάλμα κατά την ανάκτηση των εγγραφών",
			),
	),
	getById: new APIServer({ method: "POST", path: "/registrations/[id:number]", responseSchema: z_RegistrationsResponse }, [authenticateMiddleware], ({ params }) =>
		handlerResult(async () => {
			const id = Number(params.id);
			const [registration] = await executeQuery<Registrations>("SELECT * FROM registrations WHERE id = ?", [id]);
			if (!registration) throw Error("Registration not found");
			return registration;
		}),
	),
	getByReregistrationUrl: new APIServer(
		{ method: "GET", path: "/registrations/reregistration/[url:string]", responseSchema: z_RegistrationsResponse },
		[],
		({ params }) =>
			handlerResult(async () => {
				const [registration] = await executeQuery<Registrations>("SELECT * FROM registrations WHERE registration_url = ?", [params.url]);
				if (!registration) throw Error("Registration not found");
				return registration;
			}),
	),
	getTotal: new APIServer({ method: "GET", path: "/registrations/total", responseSchema: z.object({ total: z.number() }) }, [authenticateMiddleware], () =>
		handlerResult(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_registrations"))[0]),
	),
	getTotalByYear: new APIServer(
		{ method: "GET", path: "/registrations/totalByYear", responseSchema: z.record(z.number(), z.number()) },
		[authenticateMiddleware],
		() =>
			handlerResult(async () => {
				let firstYear = 2023;
				const currentYear = new Date().getFullYear();
				const result = await executeQuery<{ total: number }>("SELECT COUNT(*) AS total FROM registrations GROUP BY registration_year");
				const returnObj = {} as Record<number, number>;
				for (let year = firstYear; year <= currentYear; year++) {
					returnObj[year] = result[year - firstYear]?.total || 0;
				}
				return returnObj;
			}),
	),
	getYears: new APIServer({ method: "GET", path: "/registrations/years", responseSchema: z.array(z.string()) }, [authenticateMiddleware], () =>
		handlerResult(async () => {
			const result = await executeQuery<{ registration_year: string }>(
				"SELECT DISTINCT registration_year FROM registrations ORDER BY registration_year DESC",
			);
			return result.map((row) => row.registration_year);
		}, "Σφάλμα κατά την ανάκτηση των διαθέσιμων σχολικών ετών"),
	),
	post: new APIServer({ method: "POST", path: "/registrations", schema: postReq, responseSchema: z_InsertResponse }, [], ({ body, env }) =>
		handlerResult(async (T) => {
			const { insertId } = await T.executeQuery(
				`INSERT INTO registrations (last_name, first_name, am, amka, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, class_id, teacher_id, instrument_id, date, pass, registration_url) VALUES (???)`,
				body,
			);
			await T.executeQuery("UPDATE total_registrations SET amount = amount + 1");
			let mail_subscription = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
			if (mail_subscription.length === 0) {
				const unsubscribe_token = R.link(16);
				mail_subscription = [{ email: body.email, unsubscribe_token, unrelated: false }];
				await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", mail_subscription[0]);
			}
			if (isProduction()) {
				// Send automated email to the student for the successful registration
				const { AUTOMATED_EMAILS_SERVICE_URL: service_url, AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN: authToken } = env ?? {};
				if (!service_url || !authToken) throw Error("Unauthorized access to the email service");
				await fetch(service_url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						authToken,
						to: mail_subscription[0].email,
						subject: "Επιτυχής εγγραφή",
						htmlTemplateName: successfulRegistrationTemplate(body.class_id, body.class_year),
						templateData: {
							token: mail_subscription[0].unsubscribe_token,
							class_year: body.class_year,
							class_type: (body.class_id === 0 ? "Βυζαντινής" : body.class_id === 1 ? "Παραδοσιακής" : "Ευρωπαϊκής") + " Μουσικής",
							registration_year: body.registration_year,
						},
					}),
				});
			}

			return { insertId };
		}, "Σφάλμα κατά την προσθήκη της εγγραφής"),
	),
	update: new APIServer({ method: "PUT", path: "/registrations", schema: z_Registrations }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			await T.executeQuery(
				`UPDATE registrations SET am=?, amka=?, last_name=?, first_name=?, fathers_name=?, telephone=?, cellphone=?, email=?, birth_date=?, road=?, number=?, tk=?, region=?, registration_year=?, class_year=?, class_id=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, total_payment=?, payment_date=?, pass=? WHERE id=?`,
				body,
			);
			return "Registration updated successfully";
		}, "Σφάλμα κατά την ενημέρωση της εγγραφής"),
	),
	delete: new APIServer({ method: "DELETE", path: "/registrations", schema: z_IdArray }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const ids = body as number[];
			if (ids.length === 1) await T.executeQuery(`DELETE FROM registrations WHERE id = ?`, ids);
			else await T.executeQuery(`DELETE FROM registrations WHERE id IN (???)`, ids);
			await T.executeQuery("UPDATE total_registrations SET amount = amount - ?", [ids.length]);

			return "Registration deleted successfully";
		}, "Σφάλμα κατά την διαγραφή των εγγραφών"),
	),
	emailSubscribe: new APIServer(
		{ method: "POST", path: "/registrations/email-subscribe", schema: z_Email, responseSchema: z.object({ subscribed: z.boolean() }) },
		[],
		({ body }) =>
			handlerResult(async (T) => {
				await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, R.link(16)]);
				return { subscribed: true };
			}, "Σφάλμα κατά την εγγραφή στο newsletter"),
	),
	emailUnsubscribe: new APIServer(
		{ method: "POST", path: "/registrations/email-unsubscribe", schema: z_EmailToken, responseSchema: z.object({ isValid: z.boolean() }) },
		[],
		({ body }) =>
			handlerResult(async (T) => {
				const isSubscribed = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE unsubscribe_token = ?", [body.token]);
				if (isSubscribed.length === 0) return { isValid: false };
				await T.executeQuery("DELETE FROM email_subscriptions WHERE unsubscribe_token = ?", [body.token]);
				return { isValid: true };
			}, "Σφάλμα κατά την απεγγραφή από το newsletter"),
	),
	getSubscriptionToken: new APIServer(
		{ method: "POST", path: "/registrations/email-subscribe/token", schema: z_Email, responseSchema: z.object({ token: z.string().nullable() }) },
		[],
		({ body }) =>
			handlerResult(async () => {
				const [isSubscribed] = await executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email = ?", [body.email]);
				if (!isSubscribed) return { token: null };
				return { token: isSubscribed.unsubscribe_token };
			}, "Σφάλμα κατά την ανάκτηση του token απεγγραφής"),
	),
};

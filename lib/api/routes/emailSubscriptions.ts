import { z } from "astro/zod";
import type { EmailSubscriptions } from "@_types/entities";
import { executeQuery } from "@lib/utils.server";
import { Random as R } from "@lib/random";
import { APIServer, handlerResult } from "./APIServer";

/**
 * Newsletter subscriptions — moved out of the retired `Registrations` group.
 *
 * Paths are UNCHANGED (`/registrations/email-*`) on purpose: unsubscribe links
 * already sit in thousands of sent emails and in the static templates, so the
 * URL is part of the public contract. Only the internal group key changed
 * (`Registrations.emailUnsubscribe` → `EmailSubscriptions.emailUnsubscribe`).
 *
 * These routes are deliberately unauthenticated — they are reached from email
 * links by people who have no admin session.
 */

const z_Email = z.object({ email: z.string() });
const z_EmailToken = z.object({ token: z.string() });

export const emailSubscriptionsRoutes = {
	emailSubscribe: new APIServer(
		{ method: "POST", path: "/registrations/email-subscribe", schema: z_Email, responseSchema: z.object({ subscribed: z.boolean() }) },
		[],
		({ body }) =>
			handlerResult(async (T) => {
				await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [body.email, R.link(16)]);
				return { subscribed: true };
			}, "Σφάλμα κατά την εγγραφή στο newsletter"),
	),
	emailUnsubscribeValidate: new APIServer(
		{ method: "POST", path: "/registrations/email-unsubscribe/validate", schema: z_EmailToken, responseSchema: z.object({ isValid: z.boolean() }) },
		[],
		({ body }) =>
			handlerResult(async () => {
				const [isSubscribed] = await executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE unsubscribe_token = ?", [body.token]);
				return { isValid: Boolean(isSubscribed) };
			}, "Σφάλμα κατά τον έλεγχο του token απεγγραφής"),
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

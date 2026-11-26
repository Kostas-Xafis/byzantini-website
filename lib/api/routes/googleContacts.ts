import { OAUTH_FLOW_TTL_MS, sealOAuthFlow, type OAuthFlow } from "@lib/auth/oauthFlow";
import { contactsAuthorizationURL, disconnect, loadLink } from "@lib/contacts/link.server";
import { applySync, previewSync } from "@lib/contacts/sync.server";
import { getEnv } from "@env/env";
import { generateCodeVerifier, generateState } from "arctic";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult } from "./APIServer";
import { flowCookieOptions, flowSecret } from "./authentication";
import { COOKIE } from "./cookies";
import { authenticateMiddleware, currentSession, requirePermission } from "./middleware/authenticate";

/**
 * «Επαφές Google» (sysadmin + owner): the school's Google account contacts, kept in sync with the pupil
 * register through the People API (lib/contacts/). Connect the account once, then «Προεπισκόπηση» shows what
 * would change and «Εφαρμογή» does exactly that (after backing up every contact to R2).
 */

const guard = [authenticateMiddleware, requirePermission("googleContacts")];

const z_Counts = z.object({
	create: z.number(),
	update: z.number(),
	adopted: z.number(),
	unchanged: z.number(),
	remove: z.number(),
	duplicates: z.number(),
	excluded: z.number(),
	noPhone: z.number(),
	untouchedShared: z.number(),
});

const z_Summary = z_Counts.extend({
	created: z.number(),
	updated: z.number(),
	removed: z.number(),
	duplicatesRemoved: z.number(),
	labelsCreated: z.number(),
	backup: z.string(),
	error: z.string().optional(),
});

const z_StatusRes = z.object({
	/** GOOGLE_CLIENT_ID/SECRET are set in this environment. */
	available: z.boolean(),
	link: z
		.object({
			account_email: z.string(),
			connected_by: z.string(),
			connected_at: z.number(),
			status: z.enum(["ok", "expired"]),
			last_sync_at: z.number().nullable(),
			last_sync_by: z.string().nullable(),
			last_sync_summary: z_Summary.nullable(),
		})
		.nullable(),
});

const z_Removal = z.object({ resourceName: z.string(), name: z.string(), phones: z.array(z.string()) });

const z_PreviewRes = z.object({
	account_email: z.string(),
	contactsTotal: z.number(),
	hash: z.string(),
	counts: z_Counts,
	newLabels: z.array(z.string()),
	create: z.array(z.object({ name: z.string(), phone: z.string(), people: z.array(z.string()) })),
	update: z.array(z.object({ from: z.string(), to: z.string(), phone: z.string(), adopted: z.boolean(), changes: z.array(z.string()) })),
	remove: z.array(z_Removal),
	duplicates: z.array(z_Removal),
	excluded: z.array(z.object({ phone: z.string(), pupils: z.array(z.string()) })),
	noPhone: z.array(z.string()),
	untouchedShared: z.array(z_Removal),
});

const parseSummary = (text: string | null) => {
	if (!text) return null;
	const parsed = z_Summary.safeParse(JSON.parse(text));
	return parsed.success ? parsed.data : null;
};

export const googleContactsRoutes = {
	status: new APIServer({ method: "GET", path: "/google-contacts", responseSchema: z_StatusRes }, guard, () =>
		handlerResult(async () => {
			const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();
			const link = await loadLink();
			return {
				available: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
				link: link && {
					account_email: link.account_email,
					connected_by: link.connected_by,
					connected_at: link.connected_at,
					status: link.status,
					last_sync_at: link.last_sync_at,
					last_sync_by: link.last_sync_by,
					last_sync_summary: parseSummary(link.last_sync_summary),
				},
			};
		}, "Σφάλμα κατά την ανάκτηση της σύνδεσης επαφών"),
	),
	/** Starts connecting the school's Google account (the browser then goes to the returned URL). */
	connect: new APIServer(
		{ method: "POST", path: "/google-contacts/connect", responseSchema: z.object({ OAuthUrl: z.string() }) },
		guard,
		({ cookies, request }) =>
			handlerResult(async () => {
				const flow: OAuthFlow = {
					provider: "google",
					state: generateState(),
					codeVerifier: generateCodeVerifier(),
					intent: "contacts",
					userId: (await currentSession(cookies)).userId,
					expiresAt: Date.now() + OAUTH_FLOW_TTL_MS,
				};
				const url = contactsAuthorizationURL(new URL(request.url).origin, flow.state, flow.codeVerifier);
				cookies.set(COOKIE.oauthFlow, await sealOAuthFlow(flow, flowSecret()), flowCookieOptions(false));
				return { OAuthUrl: url.toString() };
			}, "Σφάλμα κατά την έναρξη της σύνδεσης"),
	),
	disconnect: new APIServer({ method: "DELETE", path: "/google-contacts" }, guard, () =>
		handlerResult(async () => {
			await disconnect();
			return "Ο λογαριασμός Google αποσυνδέθηκε. Οι επαφές του δεν άλλαξαν.";
		}, "Σφάλμα κατά την αποσύνδεση"),
	),
	/** What a sync would change. Nothing is written. */
	preview: new APIServer({ method: "GET", path: "/google-contacts/preview", responseSchema: z_PreviewRes }, guard, () =>
		handlerResult(() => previewSync(), "Σφάλμα κατά την προεπισκόπηση των επαφών"),
	),
	apply: new APIServer(
		{
			method: "POST",
			path: "/google-contacts/apply",
			schema: z.object({ hash: z.string().length(64), deleteDuplicates: z.boolean() }),
			responseSchema: z_Summary,
		},
		guard,
		({ body, cookies }) =>
			handlerResult(async () => {
				const session = await currentSession(cookies);
				if (!session.email) throw APIError.badRequest("Λείπει ο διαχειριστής");
				return applySync(body.hash, body.deleteDuplicates, session.email);
			}, "Σφάλμα κατά τον συγχρονισμό των επαφών"),
	),
};

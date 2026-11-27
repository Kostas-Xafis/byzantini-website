import { getEnv } from "@env/env";
import { INTEREST_PAGES, z_IdArray, z_InterestDeclaration, z_InterestDeclarationInput } from "@lib/api/schemas";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIServer, handlerResult } from "./APIServer";
import { sendAutomatedEmail } from "./emailService";
import { authenticateMiddleware } from "./middleware/authenticate";
import { rateLimitMiddleware } from "./middleware/rateLimit";

/**
 * «Δήλωση Ενδιαφέροντος» (migration 0013): a family that is thinking about the school leaves a name, an email, a
 * phone and an optional question on the contact page (linked from the home page's hero) (`post`, public, rate-limited). The secretariat is
 * emailed each one (reply-to: the family) and reads / deletes them in the admin page «Δηλώσεις ενδιαφέροντος»
 * (`list`, `delete`, every admin). A row that is still stored is one nobody has dealt with yet.
 */

/** The secretariat inboxes that get every declaration: both departments' addresses (contact page). */
export const DEFAULT_INTEREST_RECIPIENTS = ["byzscholemousikhs@gmail.com", "music@inmm.gr"];

/** `INTEREST_NOTIFY_EMAILS` (comma-separated) overrides the default inboxes. */
export function interestRecipients(): string[] {
	const configured = (getEnv().INTEREST_NOTIFY_EMAILS ?? "")
		.split(",")
		.map((email) => email.trim())
		.filter(Boolean);
	return configured.length > 0 ? configured : DEFAULT_INTEREST_RECIPIENTS;
}

const PAGE_LABELS: Record<(typeof INTEREST_PAGES)[number], string> = { home: "Αρχική σελίδα", contact: "Σελίδα επικοινωνίας" };

const formatDate = (ms: number) =>
	new Date(ms).toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** One line, no control characters: the names go into the email's subject. */
const oneLine = (value: string) => value.replace(/[\s\u0000-\u001f]+/g, " ").trim();

/** 12 months, as the privacy policy promises. */
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

const SENT_MESSAGE = "Η δήλωσή σας καταχωρήθηκε. Η Γραμματεία θα επικοινωνήσει μαζί σας σύντομα.";

export const interestDeclarationsRoutes = {
	post: new APIServer(
		{ method: "POST", path: "/interest-declarations", schema: z_InterestDeclarationInput },
		[rateLimitMiddleware("interest")],
		({ body, env, request }) =>
			handlerResult(async () => {
				// The honeypot field is hidden from people: a filled one is a bot. Answer as if it worked.
				if (body.website) return SENT_MESSAGE;

				const now = Date.now();
				const row = {
					first_name: oneLine(body.first_name),
					last_name: oneLine(body.last_name),
					email: body.email,
					phone: oneLine(body.phone),
					message: body.message,
					page: body.page ?? "",
					created_at: now,
				};
				// Kept at most 12 months (privacy policy, «Πόσο χρόνο κρατάμε τα δεδομένα»): each new one prunes the old ones.
				await executeQuery("DELETE FROM interest_declarations WHERE created_at < ?", [now - RETENTION_MS]);
				await executeQuery("INSERT INTO interest_declarations (first_name, last_name, email, phone, message, page, created_at) VALUES (???)", row);

				// Saved first, then mailed: a mail outage must not lose the declaration (it is still in the admin page).
				const fullName = `${row.first_name} ${row.last_name}`;
				const templateData = {
					first_name: row.first_name,
					last_name: row.last_name,
					email: row.email,
					phone: row.phone,
					message: row.message || "(χωρίς μήνυμα)",
					page: body.page ? PAGE_LABELS[body.page] : "Ιστοσελίδα",
					date: formatDate(now),
					admin_url: `${new URL(request.url).origin}/admin/interest`,
				};
				const sends = await Promise.allSettled(
					interestRecipients().map((to) =>
						sendAutomatedEmail(env, {
							to,
							subject: `Δήλωση ενδιαφέροντος: ${fullName}`,
							htmlTemplateName: "interest_declaration.html",
							templateData,
							replyTo: { email: row.email, name: fullName },
						}),
					),
				);
				for (const send of sends) {
					if (send.status === "rejected") console.error("[interest] notification email failed:", send.reason);
					else if (!send.value.ok) console.error(`[interest] notification email failed: emails worker answered ${send.value.status}`);
				}
				return SENT_MESSAGE;
			}, "Σφάλμα κατά την καταχώρηση της δήλωσης ενδιαφέροντος"),
	),
	list: new APIServer({ method: "GET", path: "/interest-declarations", responseSchema: z.array(z_InterestDeclaration) }, [authenticateMiddleware], () =>
		handlerResult(
			() =>
				executeQuery<z.infer<typeof z_InterestDeclaration>>(
					"SELECT id, first_name, last_name, email, phone, message, page, created_at FROM interest_declarations ORDER BY created_at DESC",
				),
			"Σφάλμα κατά την ανάκτηση των δηλώσεων ενδιαφέροντος",
		),
	),
	delete: new APIServer({ method: "DELETE", path: "/interest-declarations", schema: z_IdArray }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			await executeQuery(`DELETE FROM interest_declarations WHERE id IN (${questionMarks(body)})`, body);
			return body.length === 1 ? "Η δήλωση διαγράφηκε" : "Οι δηλώσεις διαγράφηκαν";
		}, "Σφάλμα κατά τη διαγραφή των δηλώσεων ενδιαφέροντος"),
	),
};

/**
 * Shared transactional-email sender (server-side, not a route group).
 *
 * Calls the emails worker (`byzantini-website-emails`) through the
 * `EMAIL_SERVICE` service binding instead of the retired
 * `AUTOMATED_EMAILS_SERVICE_URL` HTTP endpoint. The worker still authenticates
 * every call with the shared auth token — its URL stays publicly reachable for
 * the `templates:build` CLI (`POST /html-templates`), so the token is passed
 * in the body exactly as before.
 *
 * Usage mirrors the old code: `await sendAutomatedEmail(env, payload)` — a
 * missing binding/token throws ("Unauthorized access to the email service",
 * same message as the old guard) and the worker's response is intentionally
 * not inspected (same semantics as the old `fetch` call).
 */

export interface AutomatedEmailPayload {
	to: string;
	subject: string;
	htmlTemplateName: string;
	templateData?: Record<string, string | number | undefined>;
}

export function sendAutomatedEmail(env: Record<string, any> | undefined, payload: AutomatedEmailPayload): Promise<Response> {
	const service = (env ?? {})["EMAIL_SERVICE"] as Fetcher | undefined;
	const authToken = (env ?? {})["AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN"] as string | undefined;
	if (!service || !authToken) throw new Error("Unauthorized access to the email service");
	return service.fetch("https://email-service.internal/", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ authToken, ...payload }),
	});
}

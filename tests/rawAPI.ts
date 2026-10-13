/**
 * Raw, anonymous HTTP access to the dev server's `/api`, for tests that must
 * reach the server exactly as written: unknown paths, wrong methods, malformed
 * path params and bodies the typed harness (`useTestAPI`) would reject before
 * sending. Reads `VITE_URL` from the test env (`--env-file tests/.env.test`).
 *
 * No session on purpose: logging in again would rotate the test admin's
 * session under the harness. Authenticated behaviour goes through `useTestAPI`.
 */

const base = (process.env.VITE_URL ?? "http://localhost:4321").replace(/\/+$/, "");

/** `fetch(${VITE_URL}/api${path})` — `path` is sent as written (encode it yourself), `body` as JSON. */
export function rawAPI(method: string, path: string, body?: unknown): Promise<Response> {
	const headers: Record<string, string> = { Origin: base };
	if (body !== undefined) headers["Content-Type"] = "application/json";
	return fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

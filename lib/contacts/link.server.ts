import { getEnv } from "@env/env";
import { APIError } from "@lib/api/routes/APIError";
import { can, isRole } from "@lib/auth/roles";
import type { OAuthFlow } from "@lib/auth/oauthFlow";
import { executeQuery } from "@lib/utils.server";
import { Google, OAuth2RequestError, decodeIdToken } from "arctic";

/**
 * The school's Google account for «Επαφές Google» — server-only.
 *
 * Connecting: `GoogleContacts.connect` starts a Google OAuth round trip with the `contacts` scope and offline
 * access (intent `contacts` in the signed `oauth_flow` cookie); Google returns to the usual `/oauth2callback`
 * (no extra redirect URI to register) and `Authentication.oauthCallback` hands the code to
 * `completeContactsConnect`, which stores the account and its refresh token in `google_contacts_link`
 * (migration 0011), encrypted with a key derived from SECRET.
 *
 * Every sync turns the refresh token into a short-lived access token (`accessToken`). Google refuses it once
 * revoked — and after 7 days while the OAuth consent screen is in "Testing" — then the row is marked
 * `expired` and the page asks to connect again.
 */

export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
export const CONTACTS_PATH = "/admin/contacts";

export type ContactsLink = {
	account_email: string;
	account_subject: string;
	refresh_token: string;
	connected_by: string;
	connected_at: number;
	status: "ok" | "expired";
	last_sync_at: number | null;
	last_sync_by: string | null;
	last_sync_summary: string | null;
};

const google = (origin = "https://localhost") => {
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();
	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw APIError.badRequest("Η σύνδεση με Google δεν είναι διαθέσιμη σε αυτό το περιβάλλον.");
	return new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${origin}/oauth2callback`);
};

// ---------------------------------------------------------------------------
// Token encryption (AES-GCM, key = HKDF(SECRET))
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function tokenKey(secret: string) {
	const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: encoder.encode("byzantini:google-contacts"), info: encoder.encode("refresh-token:v1") },
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** "v1.<iv>.<ciphertext>" — exported for the unit tests. */
export async function sealToken(token: string, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(secret), encoder.encode(token)));
	return `v1.${b64url(iv)}.${b64url(ciphertext)}`;
}

/** The token, or null when the value was sealed with another SECRET or is malformed. */
export async function openToken(sealed: string, secret: string): Promise<string | null> {
	const [version, iv, ciphertext] = sealed.split(".");
	if (version !== "v1" || !iv || !ciphertext) return null;
	try {
		const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await tokenKey(secret), fromB64url(ciphertext));
		return new TextDecoder().decode(plain);
	} catch {
		return null;
	}
}

const secret = () => {
	const { SECRET } = getEnv();
	if (!SECRET) throw new Error("SECRET is not set");
	return SECRET;
};

// ---------------------------------------------------------------------------
// The stored link
// ---------------------------------------------------------------------------

export async function loadLink(): Promise<ContactsLink | null> {
	const [row] = await executeQuery<ContactsLink>("SELECT * FROM google_contacts_link WHERE id = 1 LIMIT 1");
	return row ?? null;
}

/** Google's authorization URL for connecting the school account (offline access, consent shown every time). */
export function contactsAuthorizationURL(origin: string, state: string, codeVerifier: string): URL {
	const url = google(origin).createAuthorizationURL(state, codeVerifier, ["openid", "email", CONTACTS_SCOPE]);
	url.searchParams.set("access_type", "offline");
	// `consent` makes Google issue a refresh token again on every connection; `select_account` lets the admin
	// pick the school account even when signed in to Google with their own.
	url.searchParams.set("prompt", "consent select_account");
	return url;
}

/**
 * Finishes connecting (called by `Authentication.oauthCallback` for the `contacts` intent). Returns where to
 * go next; throws `APIError` with a Greek message the callback page shows.
 */
export async function completeContactsConnect(flow: OAuthFlow, code: string, origin: string): Promise<string> {
	if (!flow.userId) throw APIError.badRequest("Λείπει ο διαχειριστής");
	const [admin] = await executeQuery<{ email: string; role: string }>("SELECT email, role FROM sys_users WHERE id = ? LIMIT 1", [flow.userId]);
	if (!admin || !isRole(admin.role) || !can(admin.role, "googleContacts")) throw APIError.forbidden("Δεν έχετε δικαίωμα να συνδέσετε τον λογαριασμό επαφών.");

	let tokens;
	try {
		tokens = await google(origin).validateAuthorizationCode(code, flow.codeVerifier);
	} catch (error) {
		console.error("[contacts] code exchange failed:", error);
		throw APIError.badRequest("Δεν ήταν δυνατή η επιβεβαίωση με Google. Δοκιμάστε ξανά.");
	}
	const granted = tokens.hasScopes() ? tokens.scopes() : [];
	if (!granted.includes(CONTACTS_SCOPE)) {
		throw APIError.badRequest("Δεν δόθηκε πρόσβαση στις επαφές. Συνδεθείτε ξανά και επιλέξτε το κουτάκι «Επαφές» στη σελίδα της Google.");
	}
	if (!tokens.hasRefreshToken()) throw APIError.badRequest("Η Google δεν έδωσε μόνιμη πρόσβαση. Δοκιμάστε ξανά.");
	const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string };

	await executeQuery(
		`INSERT INTO google_contacts_link (id, account_email, account_subject, refresh_token, connected_by, connected_at, status)
		 VALUES (1, ?, ?, ?, ?, ?, 'ok')
		 ON CONFLICT (id) DO UPDATE SET account_email = excluded.account_email, account_subject = excluded.account_subject,
		   refresh_token = excluded.refresh_token, connected_by = excluded.connected_by, connected_at = excluded.connected_at, status = 'ok'`,
		[claims.email ?? "", claims.sub, await sealToken(tokens.refreshToken(), secret()), admin.email, Date.now()],
	);
	return `${CONTACTS_PATH}?connected=1`;
}

const EXPIRED = "Η σύνδεση με τον λογαριασμό Google έληξε ή ανακλήθηκε. Συνδέστε τον ξανά.";

/** A fresh access token for the People API, and the connected account. */
export async function accessToken(): Promise<{ token: string; link: ContactsLink }> {
	const link = await loadLink();
	if (!link) throw APIError.badRequest("Δεν έχει συνδεθεί λογαριασμός Google για τις επαφές.");
	if (link.status === "expired") throw APIError.conflict(EXPIRED);
	const refreshToken = await openToken(link.refresh_token, secret());
	if (!refreshToken) {
		await executeQuery("UPDATE google_contacts_link SET status = 'expired' WHERE id = 1");
		throw APIError.conflict(EXPIRED);
	}
	try {
		const tokens = await google().refreshAccessToken(refreshToken);
		return { token: tokens.accessToken(), link };
	} catch (error) {
		if (error instanceof OAuth2RequestError && error.code === "invalid_grant") {
			await executeQuery("UPDATE google_contacts_link SET status = 'expired' WHERE id = 1");
			throw APIError.conflict(EXPIRED);
		}
		throw error;
	}
}

/** Forgets the account and asks Google to revoke the token (best effort). */
export async function disconnect() {
	const link = await loadLink();
	if (!link) return;
	const refreshToken = await openToken(link.refresh_token, secret());
	if (refreshToken)
		await google()
			.revokeToken(refreshToken)
			.catch((error) => console.warn("[contacts] token revoke failed:", error));
	await executeQuery("DELETE FROM google_contacts_link WHERE id = 1");
}

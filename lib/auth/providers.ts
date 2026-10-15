import type { EnvTypes } from "@_types/env";
import { getEnv } from "@env/env";
import { Apple, Google, MicrosoftEntraId, decodeIdToken } from "arctic";

/**
 * Sign-in providers for the admin panel (server-only), on top of `arctic` (OAuth 2.0 / OIDC clients:
 * authorization URL, PKCE, code exchange; Apple's ES256 client secret).
 *
 * A provider is enabled when its env vars are set (`types/env.ts`); the login, signup and account pages
 * only show the enabled ones. Adding a provider = one entry here + its id in `z_AuthProviderId`.
 *
 * The ID token comes straight from the provider's token endpoint over TLS (never from the browser), so its
 * claims are read without re-verifying the signature (OIDC Core §3.1.3.7).
 *
 * Accounts are matched on `subject` (the provider's stable account id). `email` is informational, except
 * that an invite is only accepted when the provider reports the invited address.
 */

export type ProviderId = "google" | "apple" | "microsoft";
export const PROVIDER_IDS: readonly ProviderId[] = ["google", "apple", "microsoft"];

export type ProviderProfile = {
	subject: string;
	email: string | null;
	/** Whether the provider vouches that the user controls `email`. */
	emailVerified: boolean;
	avatarUrl: string | null;
};

export type ProviderInfo = { id: ProviderId; label: string; icon: string };

type ProviderDefinition = ProviderInfo & {
	/** Apple posts the result back (`response_mode=form_post`) instead of redirecting with a query string. */
	formPost: boolean;
	isConfigured(env: Readonly<EnvTypes>): boolean;
	authorizationURL(origin: string, state: string, codeVerifier: string): URL;
	exchange(origin: string, code: string, codeVerifier: string): Promise<ProviderProfile>;
};

/**
 * Where each provider sends the user back. Google keeps the URI already registered in the Google Cloud
 * console (`/oauth2callback`); the others use `/oauth2callback/<id>`.
 */
export const callbackPath = (id: ProviderId) => (id === "google" ? "/oauth2callback" : `/oauth2callback/${id}`);

const isTrue = (value: unknown) => value === true || value === "true";

/** `APPLE_PRIVATE_KEY` is the `.p8` file as PEM (newlines may be stored as `\n`). */
function pkcs8FromPem(pem: string): Uint8Array {
	const base64 = pem
		.replace(/\\n/g, "\n")
		.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const google = (origin: string) => {
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();
	return new Google(GOOGLE_CLIENT_ID!, GOOGLE_CLIENT_SECRET!, origin + callbackPath("google"));
};

const apple = (origin: string) => {
	const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = getEnv();
	return new Apple(APPLE_CLIENT_ID!, APPLE_TEAM_ID!, APPLE_KEY_ID!, pkcs8FromPem(APPLE_PRIVATE_KEY!), origin + callbackPath("apple"));
};

const microsoft = (origin: string) => {
	const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT } = getEnv();
	return new MicrosoftEntraId(MICROSOFT_TENANT || "common", MICROSOFT_CLIENT_ID!, MICROSOFT_CLIENT_SECRET!, origin + callbackPath("microsoft"));
};

const OIDC_SCOPES = ["openid", "profile", "email"];

const definitions: Record<ProviderId, ProviderDefinition> = {
	google: {
		id: "google",
		label: "Google",
		icon: "fa-brands fa-google",
		formPost: false,
		isConfigured: (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
		authorizationURL: (origin, state, verifier) => {
			const url = google(origin).createAuthorizationURL(state, verifier, OIDC_SCOPES);
			// Always show the account chooser: an admin may be signed in to several Google accounts.
			url.searchParams.set("prompt", "select_account");
			return url;
		},
		exchange: async (origin, code, verifier) => {
			const tokens = await google(origin).validateAuthorizationCode(code, verifier);
			const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean; picture?: string };
			return { subject: claims.sub, email: claims.email ?? null, emailVerified: isTrue(claims.email_verified), avatarUrl: claims.picture ?? null };
		},
	},
	apple: {
		id: "apple",
		label: "Apple",
		icon: "fa-brands fa-apple",
		formPost: true,
		isConfigured: (env) => !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
		authorizationURL: (origin, state) => {
			// Apple has no PKCE here; the signed state cookie (lib/auth/oauthFlow.ts) binds the round trip.
			const url = apple(origin).createAuthorizationURL(state, ["email"]);
			// Requesting `email` requires form_post: Apple POSTs code + state to the callback.
			url.searchParams.set("response_mode", "form_post");
			return url;
		},
		exchange: async (origin, code) => {
			const tokens = await apple(origin).validateAuthorizationCode(code);
			const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean | string };
			// "Hide my email" gives a @privaterelay.appleid.com address — verified, but not the admin's real one.
			return { subject: claims.sub, email: claims.email ?? null, emailVerified: isTrue(claims.email_verified), avatarUrl: null };
		},
	},
	microsoft: {
		id: "microsoft",
		label: "Microsoft",
		icon: "fa-brands fa-microsoft",
		formPost: false,
		isConfigured: (env) => !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
		authorizationURL: (origin, state, verifier) => {
			const url = microsoft(origin).createAuthorizationURL(state, verifier, OIDC_SCOPES);
			url.searchParams.set("prompt", "select_account");
			return url;
		},
		exchange: async (origin, code, verifier) => {
			const tokens = await microsoft(origin).validateAuthorizationCode(code, verifier);
			const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; preferred_username?: string };
			// Entra ID does not guarantee that `email` was verified (any tenant can set it): never trust it for matching.
			const email = claims.email ?? (claims.preferred_username?.includes("@") ? claims.preferred_username : undefined);
			return { subject: claims.sub, email: email ?? null, emailVerified: false, avatarUrl: null };
		},
	},
};

export const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);

/** The provider definition, or undefined when it is unknown or not configured in this environment. */
export function getProvider(id: string): ProviderDefinition | undefined {
	if (!isProviderId(id)) return undefined;
	const provider = definitions[id];
	return provider.isConfigured(getEnv()) ? provider : undefined;
}

/** Enabled providers, for the sign-in buttons. */
export function enabledProviders(): ProviderInfo[] {
	const env = getEnv();
	return PROVIDER_IDS.filter((id) => definitions[id].isConfigured(env)).map((id) => {
		const { label, icon } = definitions[id];
		return { id, label, icon };
	});
}

/** Display info for any known provider (also ones disabled here, e.g. an identity linked in production). */
export const providerInfo = (id: ProviderId): ProviderInfo => {
	const { label, icon } = definitions[id];
	return { id, label, icon };
};

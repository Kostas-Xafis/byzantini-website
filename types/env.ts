/**
 * The merged server env returned by `getEnv()` (lib/env/env.ts): the Vite/Astro built-ins plus the site's vars and
 * secrets, as their source provides them (no coercion). Bindings are not typed here: read them from `runtimeEnv` or the
 * handler `env`.
 */
export type EnvTypes = {
	MODE: string;
	DEV: boolean;
	PROD: boolean;
	SSR: boolean;
	BASE_URL: string;
	SITE?: string;

	SECRET?: string;
	GOOGLE_MAPS_KEY?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN?: string;
	PDF_SERVICE_AUTH_TOKEN?: string;
};

/** `getEnv()` under `bun test` (tests/testHelpers.ts `testEnv`): `process.env` with tests/.env.test loaded, all strings. */
export type TestEnvTypes = EnvTypes & {
	VITE_URL?: string;
	TEST_EMAIL?: string;
	TEST_PASSWORD?: string;
};

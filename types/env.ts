export type EnvTypes = {
	MODE: string;
	DEV: boolean;
	PROD: boolean;
	SSR: boolean;
	BASE_URL: string;
	SITE?: string;

	DEV_BUCKET_LOCATION?: string;
	DEV_BUCKET_URL?: string;
	SECRET?: string;
	GOOGLE_MAPS_KEY?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN?: string;
	PDF_SERVICE_AUTH_TOKEN?: string;
	TEST_EMAIL?: string;
	TEST_PASSWORD?: string;
};

export type TestEnvTypes = EnvTypes & {
	VITE_URL: string;
	TEST_EMAIL: string;
	TEST_PASSWORD: string;
};

export type EnvTypes = {
	MODE: string;
	DEV: boolean;
	PROD: boolean;
	SSR: boolean;
	BASE_URL: string;
	SITE?: string;
	CF_PAGES_BRANCH?: string;
	CF_PAGES_URL?: string;

	DEV_BUCKET_LOCATION?: string;
	DEV_BUCKET_URL?: string;
	SECRET?: string;
	GOOGLE_MAPS_KEY?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	AUTOMATED_EMAILS_SERVICE_URL?: string;
	AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN?: string;
	VITE_PDF_SERVICE_URL?: string;
	VITE_IMG_COMPRESSION_SERVICE_URL?: string;
	TEST_EMAIL?: string;
	TEST_PASSWORD?: string;
};

export type TestEnvTypes = EnvTypes & {
	VITE_URL: string;
	TEST_EMAIL: string;
	TEST_PASSWORD: string;
};

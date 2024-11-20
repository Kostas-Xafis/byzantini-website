/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly CONNECTOR: string;
	readonly TURSO_DB_URL: string;
	readonly TURSO_DB_TOKEN: string;
	readonly SECRET: string;
	readonly VITE_URL: string;
	readonly WEBSITE_URL: string;
	readonly GOOGLE_MAPS_KEY: string;
	readonly S3_ENDPOINT: string;
	readonly S3_ACCESS_KEY_ID: string;
	readonly S3_SECRET_ACCESS_KEY: string;
	readonly S3_BUCKET_NAME: string;
	readonly AUTOMATED_EMAILS_SERVICE_URL: string;
	readonly AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN: string;
	readonly VITE_PDF_SERVICE_URL: string;
	readonly VITE_IMG_COMPRESSION_SERVICE_URL: string;
	readonly ENV: string;
	readonly SAFE_BACKUP_SNAPSHOT?: string;
	readonly BACKUP_SNAPSHOT_LOCATION?: string;
	readonly DEV_SNAPSHOT_LOCATION?: string;
	readonly DEV_DB_ABSOLUTE_LOCATION?: string;
	readonly DEV_BUCKET_LOCATION?: string;
	readonly LATEST_MIGRATION_FILE: string;
	readonly PROJECT_ABSOLUTE_PATH?: string;
	readonly TEST_EMAIL?: string;
	readonly TEST_PASSWORD?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

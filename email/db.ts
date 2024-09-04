import { createClient } from "@libsql/client";

type DBType = "sqlite-prod" | "sqlite-dev" | null;

export function createDbConnection(type?: DBType) {
	const {
		// Local snaphot env variables for development
		DEV_DB_ABSOLUTE_LOCATION,
		// Turso env variables for production
		TURSO_DB_URL, TURSO_DB_TOKEN,
		// Connector type
		CONNECTOR } = process.env;
	if (type === "sqlite-prod" || CONNECTOR === "sqlite-prod") {
		console.log("Connecting to production database");
		return createClient({
			url: TURSO_DB_URL as string,
			authToken: TURSO_DB_TOKEN,
			intMode: "number",
		});
	} else {
		console.log("Connecting to development database");
		return createClient({
			url: `file://${DEV_DB_ABSOLUTE_LOCATION}`,
			intMode: "number",
		});
	}
}


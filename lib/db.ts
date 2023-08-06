import { connect } from "@planetscale/database";

export const CreateDbConnection = async () => {
	const { DB_URL, DB_PWD, DB_HOST, DB_USERNAME } = await import.meta.env;
	if (!DB_URL) throw new Error("DB_URL is not defined");
	console.log("\n\n\n\n\nDB_URL", DB_URL, "\n\n\n\n\n");
	return connect({
		host: DB_HOST,
		password: DB_PWD,
		username: DB_USERNAME,
		fetch: (url, init) => {
			delete (init as any)["cache"]; // Remove cache header
			return fetch(url, init);
		}
	});
};

const { createClient } = require("@libsql/client");

module.exports = getDatabase = function (isProduction) {
	try {
		const {
			// Local snaphot env variables for development
			DEV_DB_ABSOLUTE_LOCATION,
			// Turso env variables for production
			TURSO_DB_URL,
			TURSO_DB_TOKEN,
		} = process.env;

		let client = null;
		if (isProduction) {
			client = createClient({
				url: TURSO_DB_URL,
				authToken: TURSO_DB_TOKEN,
				intMode: "number",
			});
		} else {
			console.log(`Connecting to local sqlite database at ${DEV_DB_ABSOLUTE_LOCATION}`);
			client = createClient({
				url: `file://${DEV_DB_ABSOLUTE_LOCATION}`,
				intMode: "number",
			});
		}

		console.log(`Connected to local sqlite database`);
		return client;
	} catch (err) {
		console.error("Could not establish connection with the database");
		console.error(err);
	}
};

import mysql from "mysql2/promise";

// TODO: MANAGE CONNECTION LIMITS OR CREATE A POOL BECAUSE IT CRASHES AFTER A WHILE
export const CreateDbConnection = async () => {
	const { DB_PWD, DB_NAME, DB_HOST, DB_PORT, DEV } = await import.meta.env;
	if (!DEV) {
		console.log("Connection to production database");
	} else {
		console.log("Connection to development database");
	}
	return await mysql.createConnection({
		user: "root",
		password: DB_PWD,
		database: DB_NAME,
		host: DB_HOST,
		port: Number(DB_PORT),
		multipleStatements: false
	});
};

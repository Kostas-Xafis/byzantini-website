import mysql from "mysql2/promise";

// TODO: MANAGE CONNECTION LIMITS OR CREATE A POOL BECAUSE IT CRASHES AFTER A WHILE
export const CreateDbConnection = async () => {
	const { DB_PWD, DB_NAME, DB_HOST, DB_PORT } = await import.meta.env;
	return await mysql.createConnection({
		user: "root",
		host: DB_HOST,
		password: DB_PWD,
		database: DB_NAME,
		port: Number(DB_PORT),
		multipleStatements: false
	});
};

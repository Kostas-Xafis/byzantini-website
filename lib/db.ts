import mysql from "mysql2/promise";

// TODO: MANAGE CONNECTION LIMITS OR CREATE A POOL BECAUSE IT CRASHES AFTER A WHILE
export const CreateDbConnection = async () => {
	const { DB_URL } = await import.meta.env;
	if (!DB_URL) throw new Error("DB_URL is not defined");
	return await mysql.createConnection(DB_URL);
};

import { cast, connect, } from "@planetscale/database";

export const CreateDbConnection = async () => {
	const { DB_PWD, DB_HOST, DB_USERNAME } = await import.meta.env;
	return connect({
		host: DB_HOST,
		password: DB_PWD,
		username: DB_USERNAME,
		fetch: (url, init) => {
			delete (init as any)["cache"]; // Remove cache header
			return fetch(url, init);
		},
		cast(field, value) {
			if (field.type === 'INT64' || field.type === 'UINT64') {
				return Number(value)
			}
			// if it's a boolean
			// if (field.type === 'INT8' && field.columnLength === 1) {
			// 	return value === 1
			// }
			return cast(field, value);
		},
	});
};

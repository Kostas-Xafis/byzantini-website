import { createDbConnection } from "../lib/db";
import { CLI } from "../lib/utils.cli";

const sqliteGenerateBackup = async () => {
	const new_schema = ["PRAGMA journal_mode=WAL;"];
	const conn = createDbConnection("sqlite-prod");
	const { rows: tables } = await conn.execute(
		"SELECT * FROM sqlite_master WHERE type='table' AND sql!='' AND tbl_name!='sqlite_sequence'"
	);
	for (const table of tables) {
		const tableName = table[2];
		const createTableSql = table[4] + ";";
		new_schema.push(createTableSql);
		const { columns, rows } = await conn.execute(`SELECT * FROM ${tableName}`);
		const insertStatements = rows
			.map((row) => {
				return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${columns
					.map((col) => JSON.stringify(row[col]))
					.join(", ")});`;
			})
			.join("\n")
			.replaceAll('\\"', '""');
		new_schema.push(insertStatements);
	}
	return new_schema.join("\n");
};

const getCurrentFormattedDate = () => {
	const d = new Date();
	return `${d.getFullYear().toString().slice(-2)}-${(d.getMonth() + 1)
		.toString()
		.padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};

async function productionDatabaseReplication(force = false) {
	const { BACKUP_SNAPSHOT_LOCATION, DEV_SNAPSHOT_LOCATION, PROJECT_ABSOLUTE_PATH } = import.meta
		.env;
	if (!BACKUP_SNAPSHOT_LOCATION || !DEV_SNAPSHOT_LOCATION || !PROJECT_ABSOLUTE_PATH)
		throw Error("Missing environment variables");
	const SNAPSHOT_DATE = getCurrentFormattedDate();

	let fileBackup: string | undefined;
	if (!force) {
		try {
			let file = Bun.file(`${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`);
			fileBackup = await file.text();
		} catch (error) {
			console.log("No backup found for today, generating a new one");
		}
	}
	const sqliteBackup = fileBackup || (await sqliteGenerateBackup());

	// Store sqlite file locally
	await Bun.write(`${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`, sqliteBackup, {
		createPath: true,
	});

	await Bun.write(DEV_SNAPSHOT_LOCATION, sqliteBackup);

	await CLI.executeCommands([
		`cd ${PROJECT_ABSOLUTE_PATH}/dbSnapshots`,
		"rm -f latest.db",
		"sqlite3 latest.db < dev-snapshot.sql",
	]);

	console.log("Database replicated successfully");
}

productionDatabaseReplication();

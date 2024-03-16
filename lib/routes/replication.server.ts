import { Bucket } from "../bucket";
import { mysqlGenerateTables, sqliteGenerateBackup } from "../routes/schema.server";
import { executeCommands } from "../utils.cli";
import { asyncQueue, deepCopy } from "../utils.client";
import { MIMETypeMap, execTryCatch } from "../utils.server";
import { ReplicationRoutes } from "./replication.client";

const serverRoutes = deepCopy(ReplicationRoutes); // Copy the routes object to split it into client and server routes

async function productionBucketReplication() {
	// This is a dev only function to replicate the dev bucket from the prod bucket
	// Wipe the dev bucket
	const devBucketList = await Bucket.listDev();

	await asyncQueue(devBucketList.map((file) => {
		return () => Bucket.deleteDev(file);
	}), {
		maxJobs: 10,
	});
	console.log("Dev bucket wiped");

	const prodBucketList = await Bucket.listDev("byzantini-bucket");
	let totalReplicatedFiles = 0;
	await asyncQueue(prodBucketList.map((fileName) => {
		return async () => {
			const fileType = fileName.split(".").at(-1);
			if (!fileType) throw Error("File type not found");

			const file = await Bucket.getDev(fileName, "byzantini-bucket");
			if (!file) throw Error("File not found");

			await Bucket.putDev(file, fileName, MIMETypeMap[fileType] || "application/octet-stream");
			totalReplicatedFiles++;
		};
	}), {
		maxJobs: 10,
		verbose: true
	});

	if (totalReplicatedFiles !== prodBucketList.length) console.warn("Prod bucket replicated to dev bucket unsuccessfully");
	else console.log("Prod bucket replicated to dev bucket successfully");
}

// You'll need to authenticate with `pscale auth login` before running this function
async function productionDatabaseReplication() {
	const { REPLICA_DB_PWD, REPLICA_DB_NAME } = await import.meta.env;
	if (!REPLICA_DB_PWD || !REPLICA_DB_NAME) throw Error("Missing environment variables");
	const fs = (await eval('import("fs/promises")')) as typeof import("fs/promises");
	const d = new Date();
	const SNAPSHOT_DATE = `${d.getFullYear().toString().slice(-2)}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;

	let fileBackup;
	try {
		fileBackup = await fs.readFile(`C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/sqlite/snap-${SNAPSHOT_DATE}.sql`, {
			encoding: "utf-8"
		});
	} catch (error) {

	}
	const sqliteBackup = fileBackup || await sqliteGenerateBackup();

	// Store sqlite file locally
	await fs.writeFile(`C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/sqlite/snap-${SNAPSHOT_DATE}.sql`, sqliteBackup, {
		encoding: "utf-8"
	});

	let mysqlTables = await mysqlGenerateTables();
	mysqlTables = mysqlTables.map((createStr) => {
		const tableName = createStr.match(/`(\w+)`/)?.[1] || "";
		return {
			tableName,
			createStr: `DROP TABLE IF EXISTS \`${tableName}\`;\n` + createStr,
			inserts: []
		};
	});

	sqliteBackup.split("\n").forEach(line => {
		if (line.startsWith("INSERT")) {
			const tableName = line.match(/INTO (\w+) \(/)?.[1];
			if (!tableName) return;
			const table = mysqlTables.find(table => table.tableName === tableName);
			if (!table) return;
			table.inserts.push(line);
		}
	});


	const mysqlBackup = mysqlTables.map(table =>
		`${table.createStr};\n${table.inserts.join("\n")}`
	).join("\n");

	await fs.writeFile(`C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/mysql/snap-${SNAPSHOT_DATE}.sql`, mysqlBackup, {
		encoding: "utf-8"
	});

	const comms = [
		`$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8`,
		`mysql --defaults-file='C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini' ${REPLICA_DB_NAME}  -u root  -p${REPLICA_DB_PWD} -e 'SOURCE C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/mysql/snap-${SNAPSHOT_DATE}.sql ;'`,
	];

	try {
		await executeCommands(comms);
	} catch (error) {
		console.error(error);
	}
}


serverRoutes.replication.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		if (ctx.url.hostname !== "localhost") throw Error("This route is only available in development mode");
		// Even if the a malicious user manages to send a request to this route,
		// it wont do anything because it doesn't have access to dev env variables
		// and even if it did, the edge environment doesn't
		// support for the @aws-sdk/client-s3 package or the child_process api
		// so it would throw an error regardless
		const { service } = slug;
		if (service === "database") {
			await productionDatabaseReplication();
			return "Database replicated";
		}
		else if (service === "bucket") {
			await productionBucketReplication();
			return "Bucket replicated";
		}
		else if (service === "both") {
			await Promise.all([productionDatabaseReplication(), productionBucketReplication()]);
			return "Database and bucket replicated";
		} else throw Error("Invalid service");
	});
};


export const ReplicationServerRoutes = serverRoutes;

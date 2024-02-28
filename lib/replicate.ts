// This file runs only on the dev server to replicate the database and/or bucket from the production
import { Bucket } from "./bucket";
import { asyncQueue, sleep } from "./utils.client";
import { MIMETypeMap } from "./utils.server";

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


async function productionDatabaseReplication() {
	const exec = (await eval(`import('child_process')`)).exec as typeof import("child_process").exec;
	async function connectAndDumpSnapshot() {
		const PORT = 4300;
		const { PROD_DB_USERNAME, PROD_DB_PWD, REPLICA_DB_USERNAME, REPLICA_DB_PWD }: Record<string, string> = await import.meta.env;
		if (!PROD_DB_USERNAME || !PROD_DB_PWD || !REPLICA_DB_USERNAME || !REPLICA_DB_PWD) throw Error("Missing environment variables");
		// Command to connect to the database
		const connectCommand = [`pscale connect byzmusic-db main --port ${PORT}`];

		// Format date to yy-mm-dd
		const d = new Date();
		const SNAPSHOT_DATE = `${d.getFullYear().toString().slice(-2)}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;

		const dumpCommands = [
			`cd C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots`,
			`$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8`,
			`mysqldump --default-character-set=utf8mb4 -h 127.0.0.1 -P ${PORT} -u ${PROD_DB_USERNAME}  -p${PROD_DB_PWD} byzmusic-db --skip-extended-insert --complete-insert --set-gtid-purged=OFF | Out-File -Encoding "UTF8" snapshot-${SNAPSHOT_DATE}.sql`,
			`mysql --defaults-file='C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini' byzproductionreplica  -u ${REPLICA_DB_USERNAME}  -p${REPLICA_DB_PWD} -e 'SOURCE C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/snapshot-${SNAPSHOT_DATE}.sql ;'`,
		];

		// Function to execute shell commands
		function executeCommands(commands: string[], signal?: AbortSignal) {
			return new Promise((resolve, reject) => {
				exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${commands.join(" ; ")}"`, { signal, }, (error, stdout, stderr) => {
					if (error) {
						reject(error);
					}
					if (stderr) {
						reject(new Error(stderr));
					}
				});
			});
		}

		const closeConnController = new AbortController();
		// Fail silently
		executeCommands(connectCommand, closeConnController.signal).catch(error => { });

		//Wait for the connection to be established
		await sleep(4000);

		// Execute the dump commands
		await executeCommands(dumpCommands);
		closeConnController.abort();
	}
	try {
		await connectAndDumpSnapshot();
		console.log("Database snapshot backup & replication was successful");
	} catch (error) {
		console.error(error);
	}
	// Call the function to connect and dump the snapshot
}

export function productionReplication(service: "database" | "bucket" | "both" | string = "both") {
	if (service === "database") return productionDatabaseReplication();
	if (service === "bucket") return productionBucketReplication();
	if (service === "both") return Promise.all([productionDatabaseReplication(), productionBucketReplication()]);
	throw Error("Invalid service");
}

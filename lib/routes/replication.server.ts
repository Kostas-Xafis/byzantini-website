import { Bucket } from "@lib/bucket";
import { asyncQueue } from "@utilities/AsyncQueue";
import { CLI } from "@utilities/cli";
import { deepCopy } from "@utilities/objects";
import { sqliteGenerateBackup } from "../routes/schema.server";
import { MIMETypeMap, execTryCatch, isProduction, silentImport } from "../utils.server";
import { ReplicationRoutes } from "./replication.client";

const serverRoutes = deepCopy(ReplicationRoutes); // Copy the routes object to split it into client and server routes

const fs = await silentImport<typeof import("fs/promises")>("fs/promises");
const getCurrentFormattedDate = () => {
	const d = new Date();
	return `${d.getFullYear().toString().slice(-2)}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};

async function productionBucketReplication() {
	const { DEV_BUCKET_LOCATION, S3_BUCKET_NAME } = import.meta.env;
	if (!DEV_BUCKET_LOCATION) throw Error("Missing environment variables");
	// This is a dev only function to replicate the dev bucket from the prod bucket
	// Locally and in cloudflare

	const devBucketList = await Bucket.listDev();
	const BUCKET_DATE = getCurrentFormattedDate();

	// Wipe the dev bucket
	await asyncQueue(devBucketList.map((file) => () => Bucket.deleteDev(file)), { maxJobs: 10 });
	console.log("Dev bucket wiped");

	const prodBucketList = await Bucket.listDev(S3_BUCKET_NAME);
	let totalReplicatedFiles = 0;
	// Replicate the prod bucket to the dev bucket
	await asyncQueue(prodBucketList.map((fileName) => {
		return async () => {
			const fileType = fileName.split(".").at(-1);
			if (!fileType) throw Error("File type not found");

			const file = await Bucket.getDev(fileName, S3_BUCKET_NAME);
			if (!file) throw Error("File not found");

			await Bucket.putDev(file, fileName, MIMETypeMap[fileType] || "application/octet-stream");
			await fs.mkdir(`${DEV_BUCKET_LOCATION}/${BUCKET_DATE}/${fileName.split("/").slice(0, -1).join("/")}`, { recursive: true });
			await fs.writeFile(`${DEV_BUCKET_LOCATION}/${BUCKET_DATE}/${fileName}`, Buffer.from(file), { encoding: "utf-8" });
			totalReplicatedFiles++;
		};
	}), {
		maxJobs: 10,
		verbose: true
	});

	// Copy the new local bucket to the latest folder
	await CLI.executeCommands([
		`rm -rf ${DEV_BUCKET_LOCATION}/latest`,
		`cp -r ${DEV_BUCKET_LOCATION}/${BUCKET_DATE} ${DEV_BUCKET_LOCATION}/latest`
	]);


	if (totalReplicatedFiles !== prodBucketList.length) console.warn("Prod bucket replicated to dev bucket unsuccessfully");
	else console.log("Prod bucket replicated to dev bucket successfully");
}


async function productionDatabaseReplication({ force = false, date }: { force?: boolean; date?: string; } = {}) {
	const { BACKUP_SNAPSHOT_LOCATION, DEV_SNAPSHOT_LOCATION, PROJECT_ABSOLUTE_PATH } = import.meta.env;
	if (!BACKUP_SNAPSHOT_LOCATION || !DEV_SNAPSHOT_LOCATION || !PROJECT_ABSOLUTE_PATH) throw Error("Missing environment variables");
	const SNAPSHOT_DATE = date || getCurrentFormattedDate();

	let fileBackup;
	let createNewSnapshot = force;
	if (!force) {
		try {
			const location = `${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`;
			fileBackup = await fs.readFile(location, { encoding: "utf-8" });
		} catch (error) {
			if (date) throw Error("Backup not found for the specified date");
			createNewSnapshot = true;
			console.log("No backup found for today, generating a new one");
		}
	}
	const sqliteBackup = fileBackup || await sqliteGenerateBackup();

	// If the backup is already created, we don't need to create a new one
	if (createNewSnapshot) {
		// Store sqlite file locally
		await fs.writeFile(`${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`, sqliteBackup, {
			encoding: "utf-8"
		});
	}

	await fs.writeFile(DEV_SNAPSHOT_LOCATION, sqliteBackup, {
		encoding: "utf-8"
	});

	await CLI.executeCommands([
		`cd ${PROJECT_ABSOLUTE_PATH}/dbSnapshots`,
		"rm -f latest*",
		"sqlite3 latest.db < dev-snapshot.sql",
	]);

	console.log("Database replicated successfully");
}

serverRoutes.replicationByDate.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { date } = slug;
		if (isProduction()) throw Error("This route is only available in development mode");
		if (ctx.url.hostname !== "localhost") throw Error("This route is only available in development mode");
		await productionDatabaseReplication({ force: false, date });
		return "Database replicated";
	});
};

serverRoutes.replication.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		if (isProduction()) throw Error("This route is only available in development mode");
		if (ctx.url.hostname !== "localhost") throw Error("This route is only available in development mode");
		// Even if the a malicious user manages to send a request to this route,
		// it wont do anything because it doesn't have access to dev env variables
		// and even if it did, the edge environment doesn't
		// support for the @aws-sdk/client-s3 package or the child_process api
		// so it would throw an error regardless

		switch (slug.service) {
			case "database":
			case "database-force":
				await productionDatabaseReplication({ force: slug.service === "database-force" });
				return "Database replicated";
			case "bucket":
				await productionBucketReplication();
				return "Bucket replicated";
			case "both":
				await Promise.all([productionDatabaseReplication({ force: true }), productionBucketReplication()]);
				return "Database and bucket replicated";
			default:
				throw Error("Invalid service");
		}
	});
};


// To hit this route, use /api/replication/[service]	

export const ReplicationServerRoutes = serverRoutes;

import { Bucket } from "../bucket";
import { sqliteGenerateBackup } from "../routes/schema.server";
import { CLI } from "../utils.cli";
import { asyncQueue, deepCopy } from "../utils.client";
import { MIMETypeMap, execTryCatch, silentImport } from "../utils.server";
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
	await asyncQueue(devBucketList.map((file) => {
		return () => Bucket.deleteDev(file);
	}), {
		maxJobs: 10,
	});
	console.log("Dev bucket wiped");

	const prodBucketList = await Bucket.listDev(S3_BUCKET_NAME);
	let totalReplicatedFiles = 0;
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

	if (totalReplicatedFiles !== prodBucketList.length) console.warn("Prod bucket replicated to dev bucket unsuccessfully");
	else console.log("Prod bucket replicated to dev bucket successfully");
}


async function productionDatabaseReplication(force = false) {
	const { BACKUP_SNAPSHOT_LOCATION, DEV_SNAPSHOT_LOCATION, PROJECT_ABSOLUTE_PATH } = import.meta.env;
	if (!BACKUP_SNAPSHOT_LOCATION || !DEV_SNAPSHOT_LOCATION || !PROJECT_ABSOLUTE_PATH) throw Error("Missing environment variables");
	const SNAPSHOT_DATE = getCurrentFormattedDate();

	let fileBackup;
	if (!force) {
		try {
			fileBackup = await fs.readFile(`${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`, {
				encoding: "utf-8"
			});
		} catch (error) {
			console.log("No backup found for today, generating a new one");
		}
	}
	const sqliteBackup = fileBackup || await sqliteGenerateBackup();

	// Store sqlite file locally
	await fs.writeFile(`${BACKUP_SNAPSHOT_LOCATION}/snap-${SNAPSHOT_DATE}.sql`, sqliteBackup, {
		encoding: "utf-8"
	});

	await fs.writeFile(DEV_SNAPSHOT_LOCATION, sqliteBackup, {
		encoding: "utf-8"
	});

	await CLI.executeCommands([
		`cd ${PROJECT_ABSOLUTE_PATH}/dbSnapshots`,
		"rm -f latest.db",
		"sqlite3 latest.db < dev-snapshot.sql",
	]);

	console.log("Database replicated successfully");
}


serverRoutes.replication.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		if (import.meta.env.ENV !== "DEV") throw Error("This route is only available in development mode");
		if (ctx.url.hostname !== "localhost") throw Error("This route is only available in development mode");
		// Even if the a malicious user manages to send a request to this route,
		// it wont do anything because it doesn't have access to dev env variables
		// and even if it did, the edge environment doesn't
		// support for the @aws-sdk/client-s3 package or the child_process api
		// so it would throw an error regardless
		const { service } = slug;
		if (service === "database" || service === "database-force") {
			await productionDatabaseReplication(service === "database-force");
			return "Database replicated";
		}
		else if (service === "bucket") {
			await productionBucketReplication();
			return "Bucket replicated";
		}
		else if (service === "both") {
			await Promise.all([productionDatabaseReplication(true), productionBucketReplication()]);
			return "Database and bucket replicated";
		} else throw Error("Invalid service");
	});
};


export const ReplicationServerRoutes = serverRoutes;

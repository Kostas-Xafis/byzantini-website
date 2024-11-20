import type { R2Bucket } from "@cloudflare/workers-types";
import type { APIContext } from "astro";
import { MIMETypeMap, isProduction, silentImport } from "../utils.server";

const awsSdk = await silentImport<typeof import("@aws-sdk/client-s3")>("@aws-sdk/client-s3");
const { S3_DEV_BUCKET_NAME } = import.meta.env;

const createS3Client = async () => {
	return new awsSdk.S3Client({
		region: "auto",
		endpoint: import.meta.env.S3_ENDPOINT,
		credentials: {
			accessKeyId: import.meta.env.S3_ACCESS_KEY_ID,
			secretAccessKey: import.meta.env.S3_SECRET_ACCESS_KEY,
		},
	});
};

// Development functions can have access to any bucket by passing the bucket name as an argument
// But it by default uses the dev bucket
export class Bucket {

	static getS3Bucket(context: APIContext) {
		//@ts-ignore
		return (context.locals.runtime.env as { S3_BUCKET: R2Bucket; }).S3_BUCKET;
	}

	// Development functions
	static async listDev(bucketName?: string) {
		const { ListObjectsCommand } = awsSdk;
		const client = await createS3Client();
		const cmdResult = await client.send(new ListObjectsCommand({
			Bucket: bucketName || S3_DEV_BUCKET_NAME,
		}));

		const { Contents } = cmdResult;
		if (!Contents) return [];

		return Contents.map(({ Key }) => Key).filter(Boolean) as string[];
	}

	static async getDev(filename: string, bucketName?: string) {
		const { GetObjectCommand } = awsSdk;
		let client = await createS3Client();
		let cmdResult = await client.send(new GetObjectCommand({
			Bucket: bucketName || (S3_DEV_BUCKET_NAME),
			Key: filename,
		}));
		const { Body } = cmdResult;
		if (!Body) return null;
		return (await Body.transformToByteArray()).buffer as ArrayBuffer;
	}

	static async putDev(file: ArrayBuffer | string, filename: string, filetype: string, bucketName?: string) {
		const { PutObjectCommand } = awsSdk;
		let client = await createS3Client();
		await client.send(new PutObjectCommand({
			Bucket: bucketName || (S3_DEV_BUCKET_NAME),
			Key: filename,
			Body: typeof file === "string" ? new TextEncoder().encode(file) : new Uint8Array(file),
			ContentType: filetype,
		}));
	}

	static async deleteDev(filename: string, bucketName?: string) {
		const { DeleteObjectCommand } = awsSdk;
		let client = await createS3Client();
		await client.send(new DeleteObjectCommand({
			Bucket: bucketName || (S3_DEV_BUCKET_NAME),
			Key: filename,
		}));
	}

	static async moveDev(srcFile: string, destFile: string, MIMEType: string, bucketName?: string) {
		const file = await Bucket.getDev(srcFile, bucketName);
		if (!file) return null;

		return Promise.all([
			Bucket.putDev(file, destFile, MIMEType, bucketName),
			Bucket.deleteDev(srcFile, bucketName)]);
	}

	// Production functions
	static async list(context: APIContext) {
		if (!isProduction()) return await Bucket.listDev();
		const S3 = Bucket.getS3Bucket(context);
		const list = await S3.list();
		return list.objects.map(({ key }) => key);
	}

	static get(context: APIContext, filename: string) {
		if (!isProduction()) return Bucket.getDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.get(filename);
	};

	static put(context: APIContext, file: ArrayBuffer | string, filename: string, filetype: string) {
		if (!isProduction()) return Bucket.putDev(file, filename, filetype);
		const S3 = Bucket.getS3Bucket(context);
		return S3.put(filename, file, { httpMetadata: { "contentType": filetype } });
	};

	static delete(context: APIContext, filename: string) {
		if (!isProduction()) return Bucket.deleteDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.delete(filename);
	};

	static async move(context: APIContext, srcFile: string, destFile: string) {
		const fileType = srcFile.split(".").at(-1);
		if (!fileType) throw Error("Invalid filetype");
		const MIMEType = MIMETypeMap[fileType] || "application/octet-stream";

		if (!isProduction()) return Bucket.moveDev(srcFile, destFile, MIMEType);

		const S3 = Bucket.getS3Bucket(context);
		const file = await S3.get(srcFile);
		if (!file) return null;

		return Promise.all([
			S3.put(destFile, await file.arrayBuffer(), { httpMetadata: { "contentType": MIMEType } }),
			S3.delete(srcFile),
		]);
	}
}

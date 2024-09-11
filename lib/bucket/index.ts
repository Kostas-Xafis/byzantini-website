import type { DeleteObjectCommand, GetObjectCommand, ListObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { APIContext } from "astro";
import { isDevFromURL } from "../utils.client";
import { MIMETypeMap } from "../utils.server";


const { S3_DEV_BUCKET_NAME } = import.meta.env;

// Although eval is not needed here, as it builds fine without it, it is needed because it adds an
// additional 500kb of unused code to the production build size
const createS3Client = async () => {
	const s3Client = (await eval('import("@aws-sdk/client-s3")')).S3Client as typeof S3Client;

	return new s3Client({
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

	static isDev(context: APIContext) {
		return isDevFromURL(context.url) || !((context.locals as any)?.runtime?.env);
	}

	// Development functions
	static async listDev(bucketName?: string) {
		const listObjectsCommand = (await eval('import("@aws-sdk/client-s3")')).ListObjectsCommand as typeof ListObjectsCommand;
		const client = await createS3Client();
		const cmdResult = await client.send(new listObjectsCommand({
			Bucket: bucketName || S3_DEV_BUCKET_NAME,
		}));

		const { Contents } = cmdResult;
		if (!Contents) return [];

		return Contents.map(({ Key }) => Key).filter(Boolean) as string[];
	}

	static async getDev(filename: string, bucketName?: string) {
		const getObjectCommand = (await eval('import("@aws-sdk/client-s3")')).GetObjectCommand as typeof GetObjectCommand;
		let client = await createS3Client();
		let cmdResult = await client.send(new getObjectCommand({
			Bucket: bucketName || (S3_DEV_BUCKET_NAME),
			Key: filename,
		}));
		const { Body } = cmdResult;
		if (!Body) return null;
		return (await Body.transformToByteArray()).buffer;
	}

	static async putDev(file: ArrayBuffer, filename: string, filetype: string, bucketName?: string) {
		const putObjectCommand = (await eval('import("@aws-sdk/client-s3")')).PutObjectCommand as typeof PutObjectCommand;
		let client = await createS3Client();
		await client.send(new putObjectCommand({
			Bucket: bucketName || (S3_DEV_BUCKET_NAME),
			Key: filename,
			Body: new Uint8Array(file),
			ContentType: filetype,
		}));
	}

	static async deleteDev(filename: string, bucketName?: string) {
		const deleteObjectCommand = (await eval('import("@aws-sdk/client-s3")')).DeleteObjectCommand as typeof DeleteObjectCommand;
		let client = await createS3Client();
		await client.send(new deleteObjectCommand({
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
		if (Bucket.isDev(context)) return await Bucket.listDev();
		const S3 = Bucket.getS3Bucket(context);
		const list = await S3.list();
		return list.objects.map(({ key }) => key);
	}

	static get(context: APIContext, filename: string) {
		if (Bucket.isDev(context)) return Bucket.getDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.get(filename);
	};

	static put(context: APIContext, file: ArrayBuffer, filename: string, filetype: string) {
		if (Bucket.isDev(context)) return Bucket.putDev(file, filename, filetype);
		const S3 = Bucket.getS3Bucket(context);
		return S3.put(filename, file, { httpMetadata: { "contentType": filetype } });
	};

	static delete(context: APIContext, filename: string) {
		if (Bucket.isDev(context)) return Bucket.deleteDev(filename);
		const S3 = Bucket.getS3Bucket(context);
		return S3.delete(filename);
	};

	static async move(context: APIContext, srcFile: string, destFile: string) {
		const fileType = srcFile.split(".").at(-1);
		if (!fileType) throw Error("Invalid filetype");
		const MIMEType = MIMETypeMap[fileType] || "application/octet-stream";

		if (Bucket.isDev(context)) return Bucket.moveDev(srcFile, destFile, MIMEType);

		const S3 = Bucket.getS3Bucket(context);
		const file = await S3.get(srcFile);
		if (!file) return null;

		return Promise.all([
			S3.put(destFile, await file.arrayBuffer(), { httpMetadata: { "contentType": MIMEType } }),
			S3.delete(srcFile),
		]);
	}
}

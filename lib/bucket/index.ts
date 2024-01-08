import type { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { APIContext } from "astro";
import { isDevFromURL } from "../utils.client";


// Although eval is not needed here, as it build fine without it, it is needed because it adds an
// additional 500kb of unused code to the production build size
const createS3Client = async () => {
	const s3Client = (await eval('import("@aws-sdk/client-s3")')).S3Client as typeof S3Client;

	return new s3Client({
		region: "auto",
		endpoint: await import.meta.env.S3_ENDPOINT,
		credentials: {
			accessKeyId: await import.meta.env.S3_ACCESS_KEY_ID,
			secretAccessKey: await import.meta.env.S3_SECRET_ACCESS_KEY,
		},
	});
};

export class Bucket {

	static getS3Bucket(context: APIContext) {
		//@ts-ignore
		return (context.locals.runtime.env as { S3_BUCKET: R2Bucket; }).S3_BUCKET;
	}

	static async putDev(file: ArrayBuffer, filename: string, filetype: string) {
		const putObjectCommand = (await eval('import("@aws-sdk/client-s3")')).PutObjectCommand as typeof PutObjectCommand;
		let client = await createS3Client();
		await client.send(new putObjectCommand({
			Bucket: await import.meta.env.S3_BUCKET_NAME,
			Key: filename,
			Body: new Uint8Array(file),
			ContentType: filetype,
		}));
	}

	static async getDev(filename: string) {
		const getObjectCommand = (await eval('import("@aws-sdk/client-s3")')).GetObjectCommand as typeof GetObjectCommand;
		let client = await createS3Client();
		let cmdResult = await client.send(new getObjectCommand({
			Bucket: await import.meta.env.S3_BUCKET_NAME,
			Key: filename,
		}));
		const { Body } = cmdResult;
		if (!Body) return null;
		return (await Body.transformToByteArray()).buffer;
	}

	static async deleteDev(filename: string) {
		const deleteObjectCommand = (await eval('import("@aws-sdk/client-s3")')).DeleteObjectCommand as typeof DeleteObjectCommand;
		let client = await createS3Client();
		await client.send(new deleteObjectCommand({
			Bucket: await import.meta.env.S3_BUCKET_NAME,
			Key: filename,
		}));
	}

	static async put(context: APIContext, file: ArrayBuffer, filename: string, filetype: string) {
		try {
			//Check if it's not local production build that does not support code generation like eval, but it is still localhost
			if (isDevFromURL(context.url) || !((context.locals as any)?.runtime?.env)) return await Bucket.putDev(file, filename, filetype);
			const S3 = Bucket.getS3Bucket(context);
			await S3.put(filename, file, { httpMetadata: { "contentType": filetype } });
		} catch (error) {
			console.error(error);
		}
	};

	static async get(context: APIContext, filename: string) {
		try {
			if (isDevFromURL(context.url) || !((context.locals as any)?.runtime?.env)) return await Bucket.getDev(filename);
			const S3 = Bucket.getS3Bucket(context);
			return await S3.get(filename);
		} catch (error) {
			console.error(error);
		}
	};

	static async delete(context: APIContext, filename: string) {
		try {
			if (isDevFromURL(context.url) || !((context.locals as any)?.runtime?.env)) return await Bucket.deleteDev(filename);
			const S3 = Bucket.getS3Bucket(context);
			await S3.delete(filename);
		} catch (error) {
			console.error(error);
		}
	};

	static async rename(context: APIContext, oldFilename: string, newFilename: string, filetype: string) {
		try {
			if (isDevFromURL(context.url) || !((context.locals as any)?.runtime?.env)) {
				const file = await Bucket.getDev(oldFilename);
				if (!file) return null;
				await Bucket.putDev(file, newFilename, filetype);
				await Bucket.deleteDev(oldFilename);
			}
			const S3 = Bucket.getS3Bucket(context);
			const file = await Bucket.get(context, oldFilename);
			if (!file) return null;

			if ("byteLength" in file) await S3.put(newFilename, file, { httpMetadata: { "contentType": filetype } });
			else await S3.put(newFilename, await file.arrayBuffer(), { httpMetadata: { "contentType": filetype } });
			await S3.delete(oldFilename);
		} catch (error) {
			console.error(error);
		}
	}
}

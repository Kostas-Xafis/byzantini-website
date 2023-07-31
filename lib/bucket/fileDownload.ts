import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const bucketFileDownload = async (destFileName: string) => {
	const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = await import.meta.env;
	const client = new S3Client({
		region: "auto",
		endpoint: S3_ENDPOINT,
		credentials: {
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY
		}
	});
	let err = null;
	let buffer = null;
	let type = "";
	try {
		const res = await client.send(
			new GetObjectCommand({
				Bucket: S3_BUCKET_NAME,
				Key: destFileName
			})
		);
		if (!res.Body) return null;
		let byteArray = await res.Body.transformToByteArray();
		buffer = byteArray;
		type = res.ContentType as string;
	} catch (error) {
		err = error;
	}
	client.destroy();
	if (err) throw err;
	if (!buffer) return null;
	return buffer.buffer;
};

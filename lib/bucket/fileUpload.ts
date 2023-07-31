import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const bucketFileUpload = async (file: Buffer, destFileName: string, filetype: string) => {
	const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = await import.meta.env;
	const client = new S3Client({
		region: "eeur",
		endpoint: S3_ENDPOINT,
		credentials: {
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY
		}
	});
	let err = null;
	try {
		await client.send(
			new PutObjectCommand({
				Bucket: S3_BUCKET_NAME,
				Key: destFileName,
				Body: file,
				ContentType: filetype
			})
		);
	} catch (error) {
		err = error;
	}
	client.destroy();
	if (err) throw err;
};

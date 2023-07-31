import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const bucketFileDelete = async (destFileName: string) => {
	const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = await import.meta.env;
	// Creates a client
	const client = new S3Client({
		region: "eeur",
		endpoint: S3_ENDPOINT,
		credentials: {
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY
		}
	});
	let err = null;
	let deleted = false;
	try {
		const res = await client.send(
			new DeleteObjectCommand({
				Bucket: S3_BUCKET_NAME,
				Key: destFileName
			})
		);
		deleted = res.DeleteMarker as boolean;
	} catch (error) {
		err = error;
	}
	client.destroy();
	if (err) throw err;
	return deleted;
};

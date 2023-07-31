import { S3Client, CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

export const bucketCreate = async () => {
	const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = await import.meta.env;
	const client = new S3Client({
		region: "eeur",
		endpoint: S3_ENDPOINT,
		credentials: {
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY
		}
	});
	try {
		let bucketListRes = await client.send(new ListBucketsCommand({}));
		if (bucketListRes.Buckets?.find(bucket => bucket.Name === S3_BUCKET_NAME)) return;
		let res = await client.send(
			new CreateBucketCommand({ Bucket: S3_BUCKET_NAME, CreateBucketConfiguration: { LocationConstraint: "eeur" } })
		);
	} catch (error) {}
};

import { productionReplication } from "../replicate";
import { execTryCatch } from "../utils.server";
import { ReplicationRoutes } from "./replication.client";

const serverRoutes = JSON.parse(JSON.stringify(ReplicationRoutes)) as typeof ReplicationRoutes; // Copy the routes object to split it into client and server routes


serverRoutes.replication.func = async ({ ctx, slug }) => {
	return await execTryCatch(async () => {
		if (ctx.url.hostname !== "localhost") throw Error("This route is only available in development mode");
		// Even if the a malicious user manages to send a request to this route,
		// it wont do anything because it doesn't have access to dev env variables
		// and even if it did, the edge environment doesn't
		// support for the @aws-sdk/client-s3 package or the child_process api
		// so it would throw an error regardless
		await productionReplication(slug.service);
		return "Bucket rebuilt successfully";
	});
};


export const ReplicationServerRoutes = serverRoutes;

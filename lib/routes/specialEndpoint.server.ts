// import { SpecialRoutes } from "./specialEndpoint.client";
// import { execTryCatch, executeQuery } from "../utils.server";
// import { Bucket } from "../bucket";
// import type { APIContext } from "astro";

// Include this in all .server.ts files
// const serverRoutes = JSON.parse(JSON.stringify(SpecialRoutes)) as typeof SpecialRoutes; // Copy the routes object to split it into client and server routes

// const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];

// const cvPrefix = "kathigites/cv/";
// const picturePrefix = "kathigites/picture/";
// const moveFilesToDirectories = (ctx: APIContext) => execTryCatch(async () => {
// 	const teachers = await executeQuery<{ fullname: string, cv?: string; picture?: string; }>("SELECT fullname, picture, cv FROM teachers");
// 	let res = "";
// 	for (const teacher of teachers) {
// 		const { fullname, cv, picture } = teacher;
// 		try {
// 			if (cv) {
// 				const cvBuffer = await (await Bucket.get(ctx, cv))?.arrayBuffer();
// 				if (!cvBuffer) continue;
// 				await Bucket.put(ctx, cvBuffer, cvPrefix + fullname + ".pdf", "application/pdf");
// 			}
// 			if (picture) {
// 				const pictureBuffer = await (await Bucket.get(ctx, picture))?.arrayBuffer();
// 				if (!pictureBuffer) continue;
// 				const fileType = picture.split(".")[1];
// 				const mimeType = imageMIMEType.find(type => type.includes(fileType)) as string;
// 				await Bucket.put(ctx, pictureBuffer, picturePrefix + fullname + "." + fileType, mimeType);
// 			}
// 			if (!cv && !picture) continue;
// 			res += "Successfully moved " + fullname + "'s files to separate directories\n";
// 		} catch (e) {
// 			res += JSON.stringify(e) + "\n\n";
// 		}
// 		// const cvPath = cv ? `./public/teachers/${cv}` : "";
// 		// const picturePath = picture ? `./public/teachers/${picture}` : "";
// 		// await executeQuery("UPDATE teachers SET cv = ?, picture = ? WHERE fullname = ?", [cvPath, picturePath, fullname]);
// 	}
// 	return res;
// });

// const deleteOldFiles = (ctx: APIContext) => execTryCatch(async () => {
// 	const teachers = await executeQuery<{ fullname: string, cv?: string; picture?: string; }>("SELECT picture, cv FROM teachers");
// 	for (const { cv, picture } of teachers) {
// 		if (cv) await Bucket.delete(ctx, cv);
// 		if (picture) await Bucket.delete(ctx, picture);
// 	}
// 	return "Successfully deleted old files";
// });
//
// serverRoutes.execute.func = async (ctx, slug) => {
// 	const { func } = slug;
// 	switch (func) {
		// case "moveFilesToDirectories":
		// 	return await moveFilesToDirectories(ctx);
		// case "deleteOldFiles":
		// 	return await deleteOldFiles(ctx);
// 		default: return await execTryCatch(async () => "Invalid function");
// 	}
// };

// export const SpecialServerRoutes = serverRoutes;

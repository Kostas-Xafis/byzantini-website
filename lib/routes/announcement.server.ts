import type { Announcements, AnnouncementImages } from "../../types/entities";
import { AnnouncementsRoutes } from "./announcements.client";
import { execTryCatch, executeQuery, questionMarks } from "../utils.server";
// import { Bucket } from "../bucket";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(AnnouncementsRoutes)) as typeof AnnouncementsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Omit<Announcements, "content">>("SELECT * FROM announcements"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", ids);
		const images = await executeQuery<Pick<AnnouncementImages, "image">>("SELECT image FROM announcement_images WHERE announcement_id = ?", ids);
		if (!announcement) throw Error("announcement not found");
		return { ...announcement, images: images.map(({ image }) => image) };
	});
};

serverRoutes.post.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		const { insertId } = await executeQuery(
			`INSERT INTO announcements (name, address, areacode, municipality, manager, email, telephones, priority, map, link, youtube, partner) VALUES (${questionMarks(args)})`,
			args
		);
		return { insertId };
	});
};

// serverRoutes.delete.func = async ctx => {
// return await execTryCatch(async T => {
// 	const body = await ctx.request.json();
// 	const files = await T.executeQuery<Pick<Announcements, "image">>(
// 		`SELECT image FROM Announcements WHERE id IN (${questionMarks(body)})`,
// 		body
// 	);
// 	for (const file of files) {
// 		if (file.image) await Bucket.delete(ctx, file.image);
// 	}
// 	await T.executeQuery(`DELETE FROM Announcements WHERE id IN (${questionMarks(body)})`, body);
// 	return "Announcements deleted successfully";
// });
// };

export const AnnouncementsServerRoutes = serverRoutes;

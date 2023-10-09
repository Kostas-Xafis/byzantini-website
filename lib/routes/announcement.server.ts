import type { Announcements, AnnouncementImages } from "../../types/entities";
import { AnnouncementsRoutes } from "./announcements.client";
import { execTryCatch, executeQuery, questionMarks } from "../utils.server";
import { Bucket } from "../bucket";

const bucketPrefix = "announcements";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(AnnouncementsRoutes)) as typeof AnnouncementsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Announcements>("SELECT * FROM announcements"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", ids);
		if (!announcement) throw Error("announcement not found");
		return { ...announcement };
	});
};

// This is getById but for the client side, will fix later
// serverRoutes.getById.func = async ctx => {
// 	return await execTryCatch(async () => {
// 		const ids = await ctx.request.json();
// 		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", ids);
// 		const imageNames = await executeQuery<Pick<AnnouncementImages, "name">>("SELECT name FROM announcement_images WHERE announcement_id = ?", ids);
// 		if (!announcement) throw Error("announcement not found");
// 		return { ...announcement, images: imageNames.map(({ name }) => name) };
// 	});
// };

serverRoutes.post.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body) as any[];
		const { insertId } = await executeQuery(
			`INSERT INTO announcements (title, content, date) VALUES (${questionMarks(args)})`,
			args
		);
		return { insertId };
	});
};

serverRoutes.postImage.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		const { insertId } = await executeQuery(`INSERT INTO announcement_images (announcement_id, name, priority) VALUES (${questionMarks(args)})`, args);
		return { insertId };
	});
};

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.imageUpload.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		let { id, name } = slug;
		name = decodeURIComponent(name);
		const [announcement] = await executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ? AND name = ?", [id, name]);
		if (!announcement) throw Error("announcement not found");

		const blob = await ctx.request.blob();
		const filetype = blob.type;
		if (imageMIMEType.includes(filetype)) {
			const imageBuf = await blob.arrayBuffer();
			const bucketFileName = bucketPrefix + `/${id}/` + name;
			if (announcement.name) await Bucket.delete(ctx, announcement.name);
			await Bucket.put(ctx, imageBuf, bucketFileName, filetype);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = async ctx => {
	return await execTryCatch(async T => {
		const ids = await ctx.request.json();
		const announcements = await T.executeQuery<Announcements>(`SELECT * FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
		if (!announcements || !announcements.length) throw Error("announcements not found");
		await T.executeQuery(`DELETE FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
		for (const id of ids) {
			const images = await T.executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ?", [id]);
			if (images.length) {
				await T.executeQuery(`DELETE FROM announcement_images WHERE announcement_id = ?`, [id]);
				for (const { name, announcement_id } of images) {
					await Bucket.delete(ctx, "announcements/" + announcement_id + "/" + name);
				}
			}
		}
		return "announcement deleted successfully";
	});
};

export const AnnouncementsServerRoutes = serverRoutes;

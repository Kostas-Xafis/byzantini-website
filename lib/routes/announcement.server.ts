import type { Announcements, AnnouncementImages } from "../../types/entities";
import { AnnouncementsRoutes } from "./announcements.client";
import { execTryCatch, executeQuery, generateLink, questionMarks } from "../utils.server";
import { Bucket } from "../bucket";

const bucketPrefix = "announcements/";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(AnnouncementsRoutes)) as typeof AnnouncementsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Announcements>("SELECT * FROM announcements"));
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
		const { insertId } = await executeQuery(`INSERT INTO announcement_images (announcement_id, image, priority) VALUES (${questionMarks(args)})`, args);
		return { insertId };
	});
};

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.imageUpload.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [announcement] = await executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE id = ?", [id]);
		if (!announcement) throw Error("Teacher not found");

		const blob = await ctx.request.blob();
		const filetype = blob.type;
		if (imageMIMEType.includes(filetype)) {
			const imageBuf = await blob.arrayBuffer();
			const link = bucketPrefix + `/${id}/` + generateLink(12) + "." + filetype.split("/")[1];
			if (announcement.image) await Bucket.delete(ctx, announcement.image);
			await Bucket.put(ctx, imageBuf, link, filetype);
			await executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [link, id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = async ctx => {
	return await execTryCatch(async T => {
		const ids = await ctx.request.json();
		const [announcement] = await T.executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", ids);

		if (!announcement) throw Error("announcement not found");
		await T.executeQuery(`DELETE FROM announcements WHERE id = ?`, ids);
		const images = await T.executeQuery<Pick<AnnouncementImages, "image">>("SELECT image FROM announcement_images WHERE announcement_id = ?", ids);
		if (images.length !== 0) {
			await T.executeQuery(`DELETE FROM announcement_images WHERE announcement_id = ?`, ids);

			for (const { image } of images) {
				await Bucket.delete(ctx, image);
			}
		}
		return "announcement deleted successfully";
	});
};

export const AnnouncementsServerRoutes = serverRoutes;

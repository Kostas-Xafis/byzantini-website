import type { APIContext } from "astro";
import type { AnnouncementImages, Announcements } from "../../types/entities";
import { Bucket } from "../bucket";
import { asyncQueue, deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { AnnouncementsRoutes } from "./announcements.client";

async function insertAnnouncementToSitemap(ctx: APIContext, announcement: Announcements) {
	const sitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
	if (!sitemap) return;

	let sitemapStr: string = "";
	if ("byteLength" in sitemap) sitemapStr = new TextDecoder("utf-8").decode(sitemap);
	else sitemapStr = await sitemap.text();

	const title = announcement.title.replaceAll(/ /g, "-");
	const lastmod = new Date(announcement.date).toISOString();
	const url = `<url><loc>https://musicschool-metamorfosi.gr/anakoinoseis/${title}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>`;
	sitemapStr = sitemapStr.replace("</urlset>", url + "</urlset>");

	const sitemapBuf = new TextEncoder().encode(sitemapStr);
	await Bucket.put(ctx, sitemapBuf, "sitemap-announcements.xml", "application/xml");
}

async function removeAnnouncementFromSitemap(ctx: APIContext, titles: string[]) {
	const sitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
	if (!sitemap) return;

	let sitemapStr: string = "";
	if ("byteLength" in sitemap) sitemapStr = new TextDecoder("utf-8").decode(sitemap);
	else sitemapStr = await sitemap.text();


	// Replace url that contains the announcement title
	titles.forEach(title => {
		if (!sitemapStr.includes(title)) return;
		const regexedTitle = title.replace(/[\/\\^$*+?.()|[\]{}]/g, "\\$&").replaceAll(/ /g, "-");
		const regex = new RegExp(`<url>(.|\n)*?${regexedTitle}(.|\n)*?<\/url>`, "g");
		sitemapStr = sitemapStr.replace(regex, "");
	});

	const sitemapBuf = new TextEncoder().encode(sitemapStr);
	await Bucket.put(ctx, sitemapBuf, "sitemap-announcements.xml", "application/xml");
}


const bucketPrefix = "anakoinoseis/images/";

let serverRoutes = deepCopy(AnnouncementsRoutes); // Copy the routes object to split it into client and server routes

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Announcements>("SELECT * FROM announcements"));
};

serverRoutes.getImages.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<AnnouncementImages>("SELECT * FROM announcement_images"));
};

serverRoutes.getSimple.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Omit<Announcements, "content">>("SELECT id, title, date, views FROM announcements"));
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", ids);
		if (!announcement) throw Error("announcement not found");
		return announcement;
	});
};

serverRoutes.getByTitle.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(async () => {
		const { title } = slug;
		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE title = ?", [title]);
		const imageNames = await executeQuery<Pick<AnnouncementImages, "name">>("SELECT name FROM announcement_images WHERE announcement_id = ?", [announcement.id]);
		if (!announcement) throw Error("announcement not found");
		await executeQuery("UPDATE announcements SET views = views + 1 WHERE id = ?", [announcement.id]);
		return { ...announcement, images: imageNames.map(({ name }) => name) };
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = Object.values(body) as any[];
		const { insertId } = await executeQuery(
			`INSERT INTO announcements (title, content, date) VALUES (${questionMarks(args)})`,
			args
		);
		await insertAnnouncementToSitemap(ctx, body as Announcements);
		return { insertId };
	});
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		let args = Object.values(body) as any[];
		args.push(args.shift());

		await executeQuery(`UPDATE announcements SET title = ?, content = ?, date = ? WHERE id = ?`, args);
		await removeAnnouncementFromSitemap(ctx, [body.title]);
		await insertAnnouncementToSitemap(ctx, body as Announcements);
		return "Announcement updated successfully";
	});
};

serverRoutes.postImage.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = Object.values(body);
		const { insertId } = await executeQuery(`INSERT INTO announcement_images (id, announcement_id, name, is_main) VALUES (${questionMarks(args)})`, args);
		return { insertId };
	});
};

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.imageUpload.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		let { id, name } = slug;

		const [announcement] = await executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ? AND name = ?", [id, name.replace("thumb_", "")]);
		if (!announcement) throw Error("announcement not found");

		const blob = await ctx.request.blob();
		const filetype = blob.type;
		if (!imageMIMEType.includes(filetype)) throw Error("Invalid filetype");

		const imageBuf = await blob.arrayBuffer();
		const bucketFileName = bucketPrefix + `${id}/` + name;
		if (announcement.name) await Bucket.delete(ctx, announcement.name);
		await Bucket.put(ctx, imageBuf, bucketFileName, filetype);
		return "Image uploaded successfully";
	});
};

serverRoutes.imagesDelete.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { announcement_id } = slug;
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const images = await executeQuery<AnnouncementImages>(`SELECT * FROM announcement_images WHERE announcement_id = ? AND id IN (${questionMarks(ids)})`, [announcement_id, ...ids]);
		if (!images || !images.length) throw Error("images not found");
		await executeQuery(`DELETE FROM announcement_images WHERE announcement_id = ? AND id IN (${questionMarks(ids)})`, [announcement_id, ...ids]);
		const deletionJobs = [];
		for (const { name } of images) {
			deletionJobs.push(
				() => Bucket.delete(ctx, bucketPrefix + announcement_id + "/" + name),
				() => Bucket.delete(ctx, bucketPrefix + announcement_id + "/thumb_" + name)
			);
		}
		await asyncQueue(deletionJobs, {
			maxJobs: 10,
		});
		return "Images deleted successfully";
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const announcements = await T.executeQuery<Announcements>(`SELECT * FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
		if (!announcements || !announcements.length) throw Error("announcements not found");
		await T.executeQuery(`DELETE FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
		for (const id of ids) {
			const images = await T.executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ?", [id]);
			if (images.length) {
				await T.executeQuery(`DELETE FROM announcement_images WHERE announcement_id = ?`, [id]);
				for (const { name, announcement_id } of images) {
					await Promise.all([
						Bucket.delete(ctx, bucketPrefix + announcement_id + "/" + name),
						Bucket.delete(ctx, bucketPrefix + announcement_id + "/thumb_" + name)
					]);
				}
			}
		}
		await removeAnnouncementFromSitemap(ctx, announcements.map(({ title }) => title));
		return "announcement deleted successfully";
	});
};

export const AnnouncementsServerRoutes = serverRoutes;

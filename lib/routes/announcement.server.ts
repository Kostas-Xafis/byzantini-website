import type { APIContext } from "astro";
import type { AnnouncementImages, Announcements } from "../../types/entities";
import { Bucket } from "../bucket";
import { asyncQueue, deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { AnnouncementsRoutes, type PageAnnouncement } from "./announcements.client";

async function insertAnnouncementToSitemap(ctx: APIContext, announcement: Omit<Announcements, "id" | "views">) {
	const sitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
	if (!sitemap) return;

	let sitemapStr: string = "";
	if ("byteLength" in sitemap) sitemapStr = new TextDecoder("utf-8").decode(sitemap);
	else sitemapStr = await sitemap.text();

	const title = announcement.title.replaceAll(/ /g, "-");
	const lastmod = new Date(announcement.date).toISOString();
	const url = `<url><loc>https://musicschool-metamorfosi.gr/sxoli/anakoinoseis/${title}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>`;
	sitemapStr = sitemapStr.replace("</urlset>", url + "</urlset>");

	const sitemapBuf = new TextEncoder().encode(sitemapStr);
	await Bucket.put(ctx, sitemapBuf.buffer as ArrayBuffer, "sitemap-announcements.xml", "application/xml");
}

// Doesn't work as expected
async function removeAnnouncementFromSitemap(ctx: APIContext, titles: string[]) {
	const sitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
	if (!sitemap) return;

	let sitemapStr: string = "";
	if ("byteLength" in sitemap) sitemapStr = new TextDecoder("utf-8").decode(sitemap);
	else sitemapStr = await sitemap.text();


	// Replace url that contains the announcement title
	titles.forEach(title => {
		if (!sitemapStr.includes(title)) return;
		const regexedTitle = title.replace(/[\/\\^$*+?.()|[\]{}]/g, "\\$&").replaceAll(" ", "%20");
		const regex = new RegExp(`<url>(.|\n)*?${regexedTitle}(.|\n)*?<\/url>`, "g");
		sitemapStr = sitemapStr.replace(regex, "");
	});

	const sitemapBuf = new TextEncoder().encode(sitemapStr);
	await Bucket.put(ctx, sitemapBuf.buffer as ArrayBuffer, "sitemap-announcements.xml", "application/xml");
}


const bucketPrefix = "anakoinoseis/images/";

let serverRoutes = deepCopy(AnnouncementsRoutes); // Copy the routes object to split it into client and server routes

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Announcements>("SELECT * FROM announcements"));
};

serverRoutes.getImages.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<AnnouncementImages>("SELECT * FROM announcement_images"));
};

serverRoutes.getForPage.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<PageAnnouncement>(
		`SELECT a.id, a.title, a.date, a.content, a.views,
			(SELECT ai.name FROM announcement_images as ai WHERE ai.announcement_id = a.id AND ai.is_main) as main_image,
			COUNT(i.name) as total_images
		FROM announcements as a LEFT JOIN announcement_images as i ON a.id = i.announcement_id
		GROUP BY a.id ORDER BY a.date DESC`
	));
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", [id]);
		if (!announcement) throw Error("Announcement not found");
		return announcement;
	});
};

serverRoutes.getImagesById.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { id } = slug;
		const images = await executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ?", [id]);
		if (!images || !images.length) throw Error("Images not found");
		return images;
	});
};


serverRoutes.getByTitle.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(async T => {
		const [announcement] = await T.executeQuery<Announcements>("SELECT * FROM announcements WHERE title = ?", slug);
		const images = await T.executeQuery<AnnouncementImages>("SELECT name, is_main FROM announcement_images WHERE announcement_id = ?", [announcement.id]);
		if (!announcement) throw Error("Announcement not found");
		await T.executeQuery("UPDATE announcements SET views = views + 1 WHERE id = ?", [announcement.id]);
		return { ...announcement, images };
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
		body.links = body.links.replaceAll('youtu.be/', "www.youtube.com/embed/").replaceAll('watch?v=', "embed/");
		const { insertId } = await T.executeQuery(`INSERT INTO announcements (title, content, date, links) VALUES (???)`, body);
		// await insertAnnouncementToSitemap(ctx, body);
		return { insertId };
	});
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
		body.links = body.links.replaceAll('youtu.be/', "www.youtube.com/embed/").replaceAll('watch?v=', "embed/");
		await T.executeQuery(`UPDATE announcements SET title = ?, content = ?, date = ?, links = ? WHERE id = ?`, body);
		// await removeAnnouncementFromSitemap(ctx, [body.title]);
		// await insertAnnouncementToSitemap(ctx, body as Announcements);
		return "Announcement updated successfully";
	});
};

serverRoutes.postImage.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const { announcement_id, fileData, thumbData, fileType, name: fileName } = body as (typeof body) & { fileData: File; };
		if (!fileName.startsWith("thumb_")) {
			await executeQuery(`INSERT INTO announcement_images (announcement_id, name, is_main) VALUES (???)`, body);
		};
		const bucketFileName = bucketPrefix + `${announcement_id}/` + fileName;
		await Bucket.put(ctx, await fileData.arrayBuffer(), bucketFileName, fileType);
		if (thumbData) {
			const thumbFileName = bucketPrefix + `${announcement_id}/thumb_` + fileName;
			await Bucket.put(ctx, await thumbData.arrayBuffer(), thumbFileName, fileType);
		}
		return { insertId: 0 };
	});
};

serverRoutes.imagesDelete.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const images = await executeQuery<AnnouncementImages>(`SELECT * FROM announcement_images WHERE id IN (???)`, ids);
		if (!images || !images.length) throw Error("images not found");
		await executeQuery(`DELETE FROM announcement_images WHERE id IN (???)`, ids);

		const { announcement_id } = slug;
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
		const images = await T.executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id IN (???)", ids);
		await T.executeQuery(`DELETE FROM announcement_images WHERE announcement_id IN (???)`, ids);

		const deletionJobs = [];
		for (const { name, announcement_id } of images) {
			deletionJobs.push(
				() => Bucket.delete(ctx, bucketPrefix + announcement_id + "/" + name),
				() => Bucket.delete(ctx, bucketPrefix + announcement_id + "/thumb_" + name));
		}
		await asyncQueue(deletionJobs, {
			maxJobs: 10,
		});
		await removeAnnouncementFromSitemap(ctx, announcements.map(({ title }) => title));
		return "announcement deleted successfully";
	});
};

export const AnnouncementsServerRoutes = serverRoutes;

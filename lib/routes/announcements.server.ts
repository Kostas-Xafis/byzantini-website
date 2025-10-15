import type { AnnouncementImages, Announcements } from "@_types/entities";
import type { SitemapItem } from "@_types/global";
import { Bucket } from "@lib/bucket";
import { asyncQueue } from "@utilities/AsyncQueue";
import { deepCopy } from "@utilities/objects";
import type { APIContext } from "astro";
import { XMLBuilder, XMLParser, type X2jOptions } from "fast-xml-parser";
import { Buffer } from "node:buffer";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { AnnouncementsRoutes, type PageAnnouncement } from "./announcements.client";

const bucketPrefix = "anakoinoseis/images/";
const xmlopts: X2jOptions = {
	ignoreAttributes: false, attributeNamePrefix: "@", isArray: (tagName) => {
		return tagName === "url";
	},
};
const { WEBSITE_URL } = import.meta.env;

async function getSitemapXml(ctx: APIContext) {
	const sitemap = await Bucket.get(ctx, "sitemap-announcements.xml");
	if (!sitemap) throw Error("Sitemap not found");
	return new XMLParser(xmlopts).parse(Buffer.from('byteLength' in sitemap ? sitemap : await sitemap.arrayBuffer()));
}
function jsonToXml(json: any) {
	return new XMLBuilder({ ...xmlopts, format: true } as any).build(json) as string;
}

async function insertAnnouncementToSitemap(ctx: APIContext, announcement: Omit<Announcements, "id" | "views">) {
	const jsonSitemap = await getSitemapXml(ctx);
	const urls = (jsonSitemap.urlset?.url || []) as SitemapItem[];
	const newUrl = { loc: `${WEBSITE_URL}/sxoli/anakoinoseis/${announcement.title.replaceAll(" ", "%20")}`, lastmod: new Date(announcement.date).toISOString(), changefreq: "monthly", priority: "1.0" };
	urls.push(newUrl);

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(ctx, jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}

async function updateAnnouncementFromSitemap(ctx: APIContext, title: string, newTitle: string) {
	const jsonSitemap = await getSitemapXml(ctx);
	title = title.replaceAll(" ", "%20");
	newTitle = newTitle.replaceAll(" ", "%20");

	const urls = (jsonSitemap.urlset?.url || []) as SitemapItem[];
	const url = urls.find(url => url.loc.endsWith(title));
	if (!url) return insertAnnouncementToSitemap(ctx, { title: newTitle, content: "", date: Date.now(), links: "" });
	url.lastmod = new Date().toISOString();
	url.loc = `${WEBSITE_URL}/sxoli/anakoinoseis/${newTitle}`;

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(ctx, jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}

async function removeAnnouncementFromSitemap(ctx: APIContext, titles: string[]) {
	const jsonSitemap = await getSitemapXml(ctx);
	titles = titles.map(title => title.replaceAll(" ", "%20"));

	let urls = ((jsonSitemap.urlset?.url || []) as SitemapItem[])
		.filter(url => !titles.some(title => url.loc.endsWith(title)));

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(ctx, jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}



let serverRoutes = deepCopy(AnnouncementsRoutes); // Copy the routes object to split it into client and server routes

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Announcements>("SELECT * FROM announcements"), "Σφάλμα κατά την ανάκτηση των ανακοινώσεων");
};

serverRoutes.getImages.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<AnnouncementImages>("SELECT * FROM announcement_images"), "Σφάλμα κατά την ανάκτηση των εικόνων των ανακοινώσεων");
};

serverRoutes.getForPage.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<PageAnnouncement>(
		`SELECT a.id, a.title, a.date, a.content, a.views,
			(SELECT ai.name FROM announcement_images as ai WHERE ai.announcement_id = a.id AND ai.is_main) as main_image,
			COUNT(i.name) as total_images
		FROM announcements as a LEFT JOIN announcement_images as i ON a.id = i.announcement_id
		GROUP BY a.id ORDER BY a.date DESC`
	), "Σφάλμα κατά την ανάκτηση των ανακοινώσεων");
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
	}, "Ανακοίνωση δεν βρέθηκε");
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
		body.links = body.links.replaceAll('youtu.be/', "www.youtube.com/embed/").replaceAll('watch?v=', "embed/");
		const { insertId } = await T.executeQuery(`INSERT INTO announcements (title, content, date, links) VALUES (???)`, body);
		await insertAnnouncementToSitemap(ctx, body);
		return { insertId };
	}, "Σφάλμα κατά την προσθήκη της ανακοίνωσης");
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const [{ title: oldTitle }] = await T.executeQuery<Pick<Announcements, "title">>("SELECT title FROM announcements WHERE id = ?", [body.id]);
		body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
		body.links = body.links.replaceAll('youtu.be/', "www.youtube.com/embed/").replaceAll('watch?v=', "embed/");
		await T.executeQuery(`UPDATE announcements SET title = ?, content = ?, date = ?, links = ? WHERE id = ?`, body);
		await updateAnnouncementFromSitemap(ctx, oldTitle, body.title);
		return "Announcement updated successfully";
	}, "Σφάλμα κατά την ενημέρωση της ανακοίνωσης");
};

serverRoutes.postImage.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const { announcement_id, fileData, thumbData, fileType, name: fileName } = body as (typeof body) & { fileData: File; };

		const { insertId } = await executeQuery(`INSERT INTO announcement_images (announcement_id, name, is_main) VALUES (???)`, body);
		const bucketFileName = bucketPrefix + `${announcement_id}/` + fileName;
		await Bucket.put(ctx, await fileData.arrayBuffer(), bucketFileName, fileType);
		if (thumbData) {
			const thumbFileName = bucketPrefix + `${announcement_id}/thumb_` + fileName;
			await Bucket.put(ctx, await thumbData.arrayBuffer(), thumbFileName, fileType);
		}
		return { insertId };
	}, "Σφάλμα κατά την προσθήκη της εικόνας");
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
	}, "Σφάλμα κατά την διαγραφή των εικόνων");
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
		return "Announcement/s deleted successfully";
	}, "Σφάλμα κατά την διαγραφή των ανακοινώσεων");
};

export const AnnouncementsServerRoutes = serverRoutes;

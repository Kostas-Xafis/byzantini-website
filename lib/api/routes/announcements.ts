import { z } from "astro/zod";
import type { APIContext } from "astro";
import type { AnnouncementImages, Announcements } from "@_types/entities";
import type { SitemapItem } from "@_types/global";
import { Bucket } from "@lib/bucket";
import { asyncQueue } from "@utilities/AsyncQueue";
import { XMLBuilder, XMLParser, type X2jOptions } from "fast-xml-parser";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_AnnouncementImageUpload, z_AnnouncementImages, z_Announcements } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Announcements — Phase 4 port (contracts + handlers in one place).
 * Ported from lib/routes/announcements.client|server.ts.
 *
 * Route keys mirror the old `AnnouncementsRoutes` so components keep working:
 * get, getImages, getForPage, getById, getImagesById, getByTitle, post,
 * update, delete, postImage, imagesDelete, imagesDeleteByName.
 */

const bucketPrefix = "anakoinoseis/images/";
const xmlopts: X2jOptions = {
	ignoreAttributes: false,
	attributeNamePrefix: "@",
	isArray: (tagName) => {
		return tagName === "url";
	},
};

/** Context needed by the sitemap helpers (request stands in for APIContext). */
type SitemapCtx = { request: Request };
const asAPIContext = (request: Request) => request as unknown as APIContext;

async function getSitemapXml({ request }: SitemapCtx) {
	const sitemap = await Bucket.get(asAPIContext(request), "sitemap-announcements.xml");
	// Self-initialize: with an empty (dev/local) bucket the file may be missing;
	// in production the file always exists, so this path stays untouched.
	if (!sitemap) return { urlset: {} };
	const bytes = ("byteLength" in sitemap ? sitemap : await sitemap.arrayBuffer()) as ArrayBuffer;
	return new XMLParser(xmlopts).parse(new TextDecoder().decode(bytes));
}

function jsonToXml(json: any) {
	return new XMLBuilder({ ...xmlopts, format: true } as any).build(json) as string;
}

// Announcement URLs drop commas (the platform router rejects %2C), matching
// the site's links, the [slug] lookup and the sitemap route.
const urlTitle = (title: string) => title.replaceAll(",", "").replaceAll(" ", "%20");

// Path params arrive percent-encoded (`convertToUrlFromArgs` does not encode and
// the fetch layer does), so decode before comparing against DB titles.
const safeDecode = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

async function insertAnnouncementToSitemap({ request }: SitemapCtx, announcement: Omit<Announcements, "id" | "views">) {
	const jsonSitemap = await getSitemapXml({ request });
	const urls = (jsonSitemap.urlset?.url || []) as SitemapItem[];
	const newUrl = {
		loc: `${new URL(request.url).origin}/sxoli/anakoinoseis/${urlTitle(announcement.title)}`,
		lastmod: new Date(announcement.date).toISOString(),
		changefreq: "monthly",
		priority: "1.0",
	};
	urls.push(newUrl);

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(asAPIContext(request), jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}

async function updateAnnouncementFromSitemap({ request }: SitemapCtx, title: string, newTitle: string) {
	const jsonSitemap = await getSitemapXml({ request });
	title = urlTitle(title);
	newTitle = urlTitle(newTitle);

	const urls = (jsonSitemap.urlset?.url || []) as SitemapItem[];
	const url = urls.find((url) => url.loc.endsWith(title));
	if (!url)
		return insertAnnouncementToSitemap({ request }, {
			title: newTitle,
			content: "",
			date: Date.now(),
			links: "",
		});
	url.lastmod = new Date().toISOString();
	url.loc = `${new URL(request.url).origin}/sxoli/anakoinoseis/${newTitle}`;

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(asAPIContext(request), jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}

async function removeAnnouncementFromSitemap({ request }: SitemapCtx, titles: string[]) {
	const jsonSitemap = await getSitemapXml({ request });
	titles = titles.map(urlTitle);

	let urls = ((jsonSitemap.urlset?.url || []) as SitemapItem[]).filter((url) => !titles.some((title) => url.loc.endsWith(title)));

	jsonSitemap.urlset = { ...jsonSitemap.urlset, url: urls };
	return Bucket.put(asAPIContext(request), jsonToXml(jsonSitemap), "sitemap-announcements.xml", "application/xml");
}

// ---- Local types & group-specific request/response schemas ----
export type PageAnnouncement = Announcements & { main_image: string; total_images: number };

const positiveInt = (message = "Μη έγκυρος θετικός ακέραιος") => z.number().int().min(0, message);

// The old postReq merged `links: string()` over the announcement shape (no Greek
// message on that single field), so re-declare it here for parity.
const postReq = z_Announcements.omit({ id: true, views: true }).extend({ links: z.string() });
const updateReq = z_Announcements.omit({ views: true });
const idListReq = z.array(z.number().int().min(0, "Μη έγκυρο id"));
const nameListReq = z.array(z.string());

// `getForPage` selects only id/title/date/content/views + main_image/total_images
// (no `links`), and `main_image` is nullable when no image is flagged as main.
const z_PageAnnouncement = z.object({
	id: positiveInt("Μη έγκυρο id"),
	title: z.string().min(1, "Μη έγκυρος τίτλος"),
	date: z.number().int("Μη έγκυρη ημερομηνία"),
	content: z.string("Μη έγκυρο περιεχόμενο"),
	views: positiveInt("Μη έγκυρες προβολές"),
	main_image: z.string().nullable(),
	total_images: z.number().int(),
});
// `getByTitle` images only carry name/is_main (no id/announcement_id).
const z_ImageOnPage = z.object({
	name: z.string("Μη έγκυρο όνομα").nullable(),
	is_main: z.union([z.boolean(), z.literal(0), z.literal(1), z.null()]),
});
const z_GetByTitleResponse = z_Announcements.extend({ images: z.array(z_ImageOnPage) });
const insertResponse = z.object({ insertId: z.number().int().min(0, "Μη έγκυρο insertId") });

export const announcementsRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/announcements", responseSchema: z.array(z_Announcements) },
		() =>
			handlerResult(
				() => executeQuery<Announcements>("SELECT * FROM announcements"),
				"Σφάλμα κατά την ανάκτηση των ανακοινώσεων",
			),
	),
	getImages: new APIServer(
		{ method: "GET", path: "/announcements/images", responseSchema: z.array(z_AnnouncementImages) },
		[authenticateMiddleware],
		() =>
			handlerResult(
				() => executeQuery<AnnouncementImages>("SELECT * FROM announcement_images"),
				"Σφάλμα κατά την ανάκτηση των εικόνων των ανακοινώσεων",
			),
	),
	getForPage: new APIServer(
		{ method: "GET", path: "/announcements/page", responseSchema: z.array(z_PageAnnouncement) },
		() =>
			handlerResult(
				() =>
					executeQuery<PageAnnouncement>(
						`SELECT a.id, a.title, a.date, a.content, a.views,
			(SELECT ai.name FROM announcement_images as ai WHERE ai.announcement_id = a.id AND ai.is_main) as main_image,
			COUNT(i.name) as total_images
		FROM announcements as a LEFT JOIN announcement_images as i ON a.id = i.announcement_id
		GROUP BY a.id ORDER BY a.date DESC`,
					),
				"Σφάλμα κατά την ανάκτηση των ανακοινώσεων",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/announcements/id", schema: idListReq, responseSchema: z_Announcements },
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [announcement] = await executeQuery<Announcements>("SELECT * FROM announcements WHERE id = ?", [id]);
				if (!announcement) throw Error("Announcement not found");
				return announcement;
			}),
	),
	getImagesById: new APIServer(
		{ method: "GET", path: "/announcements/images/[id:number]", responseSchema: z.array(z_AnnouncementImages) },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(async () => {
				const id = Number(params.id);
				const images = await executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id = ?", [id]);
				if (!images || !images.length) throw Error("Images not found");
				return images;
			}),
	),
	getByTitle: new APIServer(
		{ method: "POST", path: "/announcements/title/[title:string]", responseSchema: z_GetByTitleResponse },
		({ params }) =>
			handlerResult(async (T) => {
				// Titles are matched by their comma-less form: announcement URLs drop
				// commas (the platform router rejects %2C), so lookups receive the
				// comma-stripped title ("… μουσικής, 25 Ιουνίου" → "… μουσικής 25 Ιουνίου").
				const [announcement] = await T.executeQuery<Announcements>("SELECT * FROM announcements WHERE REPLACE(title, ',', '') = ? LIMIT 1", [safeDecode(params.title)]);
				const images = await T.executeQuery<AnnouncementImages>("SELECT name, is_main FROM announcement_images WHERE announcement_id = ?", [announcement.id]);
				if (!announcement) throw Error("Announcement not found");
				await T.executeQuery("UPDATE announcements SET views = views + 1 WHERE id = ?", [announcement.id]);
				return { ...announcement, images };
			}, "Ανακοίνωση δεν βρέθηκε"),
	),
	post: new APIServer(
		{ method: "POST", path: "/announcements", schema: postReq, responseSchema: insertResponse },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async (T) => {
				body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
				body.links = body.links.replaceAll("youtu.be/", "www.youtube.com/embed/").replaceAll("watch?v=", "embed/");
				const { insertId } = await T.executeQuery(`INSERT INTO announcements (title, content, date, links) VALUES (???)`, body);
				await insertAnnouncementToSitemap({ request }, body);
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη της ανακοίνωσης"),
	),
	update: new APIServer(
		{ method: "PUT", path: "/announcements", schema: updateReq },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async (T) => {
				const [{ title: oldTitle }] = await T.executeQuery<Pick<Announcements, "title">>("SELECT title FROM announcements WHERE id = ?", [body.id]);
				body.content = body.content.replaceAll(/https:\/\/[^\s\/$.?#].[^\s]*/g, "<a href='$&'>$&</a>");
				body.links = body.links.replaceAll("youtu.be/", "www.youtube.com/embed/").replaceAll("watch?v=", "embed/");
				await T.executeQuery(`UPDATE announcements SET title = ?, content = ?, date = ?, links = ? WHERE id = ?`, body);
				await updateAnnouncementFromSitemap({ request }, oldTitle, body.title);
				return "Announcement updated successfully";
			}, "Σφάλμα κατά την ενημέρωση της ανακοίνωσης"),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/announcements", schema: idListReq },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async (T) => {
				const ids = body as number[];
				const announcements = await T.executeQuery<Announcements>(`SELECT * FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
				if (!announcements || !announcements.length) throw Error("announcements not found");
				await T.executeQuery(`DELETE FROM announcements WHERE id IN (${questionMarks(ids)})`, ids);
				const images = await T.executeQuery<AnnouncementImages>("SELECT * FROM announcement_images WHERE announcement_id IN (???)", ids);
				await T.executeQuery(`DELETE FROM announcement_images WHERE announcement_id IN (???)`, ids);

				const deletionJobs = [];
				for (const { name, announcement_id } of images) {
					deletionJobs.push(
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/" + name),
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/thumb_" + name),
					);
				}
				await asyncQueue(deletionJobs, {
					maxJobs: 10,
				});
				await removeAnnouncementFromSitemap(
					{ request },
					announcements.map(({ title }) => title),
				);
				return "Announcement/s deleted successfully";
			}, "Σφάλμα κατά την διαγραφή των ανακοινώσεων"),
	),
	postImage: new APIServer(
		{ method: "POST", path: "/announcements/images", multipart: true, schema: z_AnnouncementImageUpload, responseSchema: insertResponse },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async () => {
				const { announcement_id, fileData, thumbData, fileType, name: fileName } = body;

				const { insertId } = await executeQuery(`INSERT INTO announcement_images (announcement_id, name, is_main) VALUES (???)`, body);
				const bucketFileName = bucketPrefix + `${announcement_id}/` + fileName;
				await Bucket.put(asAPIContext(request), await fileData.arrayBuffer(), bucketFileName, fileType);
				if (thumbData) {
					const thumbFileName = bucketPrefix + `${announcement_id}/thumb_` + fileName;
					await Bucket.put(asAPIContext(request), await thumbData.arrayBuffer(), thumbFileName, fileType);
				}
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη της εικόνας"),
	),
	imagesDelete: new APIServer(
		{ method: "DELETE", path: "/announcements/images/id/[announcement_id:number]", schema: idListReq },
		[authenticateMiddleware],
		({ params, body, request }) =>
			handlerResult(async () => {
				const ids = body as number[];
				const images = await executeQuery<AnnouncementImages>(`SELECT * FROM announcement_images WHERE id IN (???)`, ids);
				if (!images || !images.length) throw Error("images not found");
				await executeQuery(`DELETE FROM announcement_images WHERE id IN (???)`, ids);

				const { announcement_id } = params;
				const deletionJobs = [];
				for (const { name } of images) {
					deletionJobs.push(
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/" + name),
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/thumb_" + name),
					);
				}
				await asyncQueue(deletionJobs, {
					maxJobs: 10,
				});
				return "Images deleted successfully";
			}, "Σφάλμα κατά την διαγραφή των εικόνων"),
	),
	// NOTE: the old announcements.server.ts never assigned a `func` to
	// imagesDeleteByName (the route was declared client-side only), so it had no
	// implementation. It is ported here mirroring `imagesDelete` but deleting by
	// image name for the given announcement.
	imagesDeleteByName: new APIServer(
		{ method: "DELETE", path: "/announcements/images/name/[announcement_id:number]", schema: nameListReq },
		[authenticateMiddleware],
		({ params, body, request }) =>
			handlerResult(async () => {
				const names = body as string[];
				const { announcement_id } = params;
				const deletionJobs = [];
				for (const name of names) {
					deletionJobs.push(
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/" + name),
						() => Bucket.delete(asAPIContext(request), bucketPrefix + announcement_id + "/thumb_" + name),
					);
				}
				await asyncQueue(deletionJobs, {
					maxJobs: 10,
				});
				await executeQuery(`DELETE FROM announcement_images WHERE announcement_id = ? AND name IN (${questionMarks(names)})`, [announcement_id, ...names]);
				return "Images deleted successfully";
			}, "Σφάλμα κατά την διαγραφή των εικόνων"),
	),
};

import { expect } from "bun:test";
import fs from 'fs';
import path from 'path';
import { array, number, object } from "valibot";
import { Bucket } from "../../lib/bucket/index.ts";
import { Random as R } from "../../lib/random.ts";
import { APIResponse } from "../../lib/routes/index.client.ts";
import { MIMETypeMap } from "../../lib/utils.server.ts";
import { v_AnnouncementImages, v_Announcements } from "../../types/entities";
import { chain, expectBody, getJson, test, useTestAPI } from "../testHelpers.ts";

const label = (str: string) => {
	return "--announcements-- " + str;
};

function announcementsTest() {
	const announcement = {
		title: "New Announcement #" + R.hex(6),
		content: "This is a test announcement.",
		date: R.date().getTime(),
		links: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	};
	const newTitle = announcement.title.replace("New", "Updated");

	const imagePaths = fs.readdirSync(path.join(process.cwd(), "notAssets")).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));

	const mainImage = R.item(imagePaths);
	const images = R.uniqueItems(imagePaths, 4);
	let newAnnouncementId: number | null;
	let newImageIds: number[] = [];

	chain([
		label("POST /announcements"), async () => {
			const res = await useTestAPI("Announcements.post", { RequestObject: announcement });

			const json = await getJson<APIResponse["Announcements.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newAnnouncementId = json.data.insertId;

			const sitemap = await Bucket.getDev("sitemap-announcements.xml");
			expect(sitemap).not.toBeNull();

			const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
			expect(sitemapStr).toContain(announcement.title.replaceAll(" ", "%20"));
		}],
		[
			label("GET /announcements/id"), async () => {
				const res = await useTestAPI("Announcements.getById", {
					RequestObject: [newAnnouncementId as number]
				});

				const json = await getJson<APIResponse["Announcements.getById"]>(res);
				expectBody(json, v_Announcements);
			}],
		[
			label("POST /announcements/images"), async () => {
				const data = new Blob([fs.readFileSync(path.join(process.cwd(), "notAssets", mainImage))]);
				const res = await useTestAPI("Announcements.postImage", {
					RequestObject: {
						name: mainImage,
						announcement_id: newAnnouncementId as number,
						is_main: true,
						fileType: MIMETypeMap[mainImage.split('.').pop() as string],
						fileData: data,
						thumbData: data,
					},
				});

				const json = await getJson<APIResponse["Announcements.postImage"]>(res);
				expectBody(json, object({ insertId: number() }));
				newImageIds.push(json.data.insertId);

				for await (const image of images) {
					const data = new Blob([fs.readFileSync(path.join(process.cwd(), "notAssets", image))]);
					const res = await useTestAPI("Announcements.postImage", {
						RequestObject: {
							name: image,
							announcement_id: newAnnouncementId as number,
							is_main: false,
							fileType: MIMETypeMap[image.split('.').pop() as string],
							fileData: data,
							thumbData: data,
						},
					});

					const json = await getJson<APIResponse["Announcements.postImage"]>(res);
					expectBody(json, object({ insertId: number() }));
					newImageIds.push(json.data.insertId);
				}
			}, {
				timeout: 20000
			}],
		[
			label("GET #1 /announcements/images/id"), async () => {
				const res = await useTestAPI("Announcements.getImagesById", {
					UrlArgs: { id: newAnnouncementId as number }
				});
				const json = await getJson<APIResponse["Announcements.getImagesById"]>(res);
				expectBody(json, array(v_AnnouncementImages));
				expect(json.data).toHaveLength(5);
			}],
		[
			label("DELETE /announcements/images"), async () => {
				const res = await useTestAPI("Announcements.imagesDelete", {
					UrlArgs: { announcement_id: newAnnouncementId as number },
					RequestObject: R.uniqueItems(newImageIds, 2)
				});

				const json = await getJson<APIResponse["Announcements.imagesDelete"]>(res);
				expectBody(json, "Images deleted successfully");
			}],
		[
			label("GET #2 /announcements/images/id"), async () => {
				const res = await useTestAPI("Announcements.getImagesById", {
					UrlArgs: { id: newAnnouncementId as number }
				});

				const json = await getJson<APIResponse["Announcements.getImagesById"]>(res);
				expectBody(json, array(v_AnnouncementImages));
				expect(json.data).toHaveLength(3);
			}],
		[
			label("PUT /announcements"), async () => {
				const res = await useTestAPI("Announcements.update", {
					RequestObject: {
						...announcement,
						id: newAnnouncementId as number,
						title: newTitle
					}
				});

				const json = await getJson<APIResponse["Announcements.update"]>(res);
				expectBody(json, "Announcement updated successfully");

				const sitemap = await Bucket.getDev("sitemap-announcements.xml");
				expect(sitemap).not.toBeNull();

				const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
				expect(sitemapStr).toContain(newTitle.replaceAll(" ", "%20"));
				expect(sitemapStr).not.toContain(announcement.title.replaceAll(" ", "%20"));
			}],
		[
			label("DELETE /announcements"), async () => {
				const res = await useTestAPI("Announcements.delete", {
					RequestObject: [newAnnouncementId as number]
				});

				const json = await getJson<APIResponse["Announcements.delete"]>(res);
				expectBody(json, "Announcement/s deleted successfully");

				const sitemap = await Bucket.getDev("sitemap-announcements.xml");
				expect(sitemap).not.toBeNull();

				const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
				expect(sitemapStr).not.toContain(newTitle.replaceAll(" ", "%20"));
			}]
	);
}

announcementsTest();

test(label("GET /announcements"), async () => {
	const res = await useTestAPI("Announcements.get");

	const json = await getJson<APIResponse["Announcements.get"]>(res);
	expectBody(json, array(v_Announcements));
});


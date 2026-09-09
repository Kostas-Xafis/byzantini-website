import { expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import { array, number, object } from "valibot";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { MIMETypeMap } from "@lib/utils.server.ts";
import { v_AnnouncementImages, v_Announcements } from "@_types/entities";
import { expectBody, fetchBucketFile, getJson, useTestAPI } from "../testHelpers.ts";

function announcementsTest() {
	const announcement = {
		title: "New Announcement #" + R.hex(6),
		content: "This is a test announcement.",
		date: R.date().getTime(),
		links: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	};
	const newTitle = announcement.title.replace("New", "Updated");

	const imagePaths = fs.readdirSync(path.join(process.cwd(), "notAssets")).filter((f) => f.endsWith(".jpg") || f.endsWith(".png"));

	const mainImage = R.item(imagePaths);
	// Bucket keys are name-based (`anakoinoseis/images/{id}/{name}`), so the main
	// image must not be re-uploaded as a regular image: a duplicate name would
	// overwrite its bucket file and break the delete-flow coverage below.
	const images = R.uniqueItems(
		imagePaths.filter((p) => p !== mainImage),
		4,
	);
	let newAnnouncementId: number | null;
	let newImageIds: number[] = [];

	const uploadImages = async () => {
		// Must be a File WITH a name, like the browser client sends. A nameless
		// Blob is serialized without a `filename` part header, so the server
		// parses it as a plain string field and `z_BlobUpload` rejects the
		// request with "Μη έγκυρο αρχείο".
		const data = new File([fs.readFileSync(path.join(process.cwd(), "notAssets", mainImage))], mainImage, {
			type: MIMETypeMap[mainImage.split(".").pop() as string],
		});
		const res = await useTestAPI("Announcements.postImage", {
			RequestObject: {
				name: mainImage,
				announcement_id: newAnnouncementId as number,
				is_main: true,
				fileType: MIMETypeMap[mainImage.split(".").pop() as string],
				fileData: data,
			},
		});

		const json = await getJson<APIResponse["Announcements.postImage"]>(res);
		expectBody(json, object({ insertId: number() }));
		newImageIds.push(json.data.insertId);

		for await (const image of images) {
			const data = new File([fs.readFileSync(path.join(process.cwd(), "notAssets", image))], image, {
				type: MIMETypeMap[image.split(".").pop() as string],
			});
			const res = await useTestAPI("Announcements.postImage", {
				RequestObject: {
					name: image,
					announcement_id: newAnnouncementId as number,
					is_main: false,
					fileType: MIMETypeMap[image.split(".").pop() as string],
					fileData: data,
				},
			});

			const json = await getJson<APIResponse["Announcements.postImage"]>(res);
			expectBody(json, object({ insertId: number() }));
			newImageIds.push(json.data.insertId);
		}
	};

	test("--announcements-- #1", async () => {
		const res = await useTestAPI("Announcements.post", { RequestObject: announcement });

		const json = await getJson<APIResponse["Announcements.post"]>(res);
		expectBody(json, object({ insertId: number() }));

		newAnnouncementId = json.data.insertId;

		const sitemap = await fetchBucketFile("sitemap-announcements.xml");
		expect(sitemap).not.toBeNull();

		const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
		expect(sitemapStr).toContain(announcement.title.replaceAll(" ", "%20"));
	});
	test("--announcements-- #2", async () => {
		const res = await useTestAPI("Announcements.getById", {
			RequestObject: [newAnnouncementId as number],
		});

		const json = await getJson<APIResponse["Announcements.getById"]>(res);
		expectBody(json, v_Announcements);
	});
	test("--announcements-- #3", uploadImages, { timeout: 20000 });
	test("--announcements-- #4", async () => {
		const res = await useTestAPI("Announcements.getImagesById", {
			UrlArgs: { id: newAnnouncementId as number },
		});
		const json = await getJson<APIResponse["Announcements.getImagesById"]>(res);
		expectBody(json, array(v_AnnouncementImages));
		expect(json.data).toHaveLength(5);
	});
	test("--announcements-- #5", async () => {
		// Defensive: `R.uniqueItems([], ...)` spins forever (and blocks the
		// event loop, so even the test timeout can't fire) — fail loudly if the
		// upload step didn't produce the expected image ids.
		expect(newImageIds.length).toBeGreaterThanOrEqual(2);
		const res = await useTestAPI("Announcements.imagesDelete", {
			UrlArgs: { announcement_id: newAnnouncementId as number },
			RequestObject: R.uniqueItems(newImageIds, 2),
		});

		const json = await getJson<APIResponse["Announcements.imagesDelete"]>(res);
		expectBody(json, "Images deleted successfully");
	});
	test("--announcements-- #6", async () => {
		const res = await useTestAPI("Announcements.getImagesById", {
			UrlArgs: { id: newAnnouncementId as number },
		});

		const json = await getJson<APIResponse["Announcements.getImagesById"]>(res);
		expectBody(json, array(v_AnnouncementImages));
		expect(json.data).toHaveLength(3);
	});
	test("--announcements-- #7", async () => {
		const res = await useTestAPI("Announcements.update", {
			RequestObject: {
				...announcement,
				id: newAnnouncementId as number,
				title: newTitle,
			},
		});

		const json = await getJson<APIResponse["Announcements.update"]>(res);
		expectBody(json, "Announcement updated successfully");

		const sitemap = await fetchBucketFile("sitemap-announcements.xml");
		expect(sitemap).not.toBeNull();

		const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
		expect(sitemapStr).toContain(newTitle.replaceAll(" ", "%20"));
		expect(sitemapStr).not.toContain(announcement.title.replaceAll(" ", "%20"));
	});
	test("--announcements-- #8", async () => {
		const res = await useTestAPI("Announcements.delete", {
			RequestObject: [newAnnouncementId as number],
		});

		const json = await getJson<APIResponse["Announcements.delete"]>(res);
		expectBody(json, "Announcement/s deleted successfully");

		const sitemap = await fetchBucketFile("sitemap-announcements.xml");
		expect(sitemap).not.toBeNull();

		const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
		expect(sitemapStr).not.toContain(newTitle.replaceAll(" ", "%20"));
	});
}

announcementsTest();

test("--announcements--", async () => {
	const res = await useTestAPI("Announcements.get");

	const json = await getJson<APIResponse["Announcements.get"]>(res);
	expectBody(json, array(v_Announcements));
});

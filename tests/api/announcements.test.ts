import { expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import { z } from "astro/zod";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { MIMETypeMap } from "@lib/utils.server.ts";
import { announcementPath } from "@utilities/announcementUrl";
import { z_AnnouncementImages, z_Announcements } from "@lib/api/schemas";
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
		expectBody(json, z.object({ insertId: z.number() }));
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
			expectBody(json, z.object({ insertId: z.number() }));
			newImageIds.push(json.data.insertId);
		}
	};

	test("--announcements-- #1", async () => {
		const res = await useTestAPI("Announcements.post", { RequestObject: announcement });

		const json = await getJson<APIResponse["Announcements.post"]>(res);
		expectBody(json, z.object({ insertId: z.number() }));

		newAnnouncementId = json.data.insertId;

		const sitemap = await fetchBucketFile("sitemap-announcements.xml");
		expect(sitemap).not.toBeNull();

		const sitemapStr = new TextDecoder().decode(sitemap as ArrayBuffer);
		expect(sitemapStr).toContain(announcementPath(announcement.title));
	});
	test("--announcements-- #2", async () => {
		const res = await useTestAPI("Announcements.getById", {
			RequestObject: [newAnnouncementId as number],
		});

		const json = await getJson<APIResponse["Announcements.getById"]>(res);
		expectBody(json, z_Announcements);
	});
	test("--announcements-- #3", uploadImages, { timeout: 20000 });
	test("--announcements-- #4", async () => {
		const res = await useTestAPI("Announcements.getImagesById", {
			UrlArgs: { id: newAnnouncementId as number },
		});
		const json = await getJson<APIResponse["Announcements.getImagesById"]>(res);
		expectBody(json, z.array(z_AnnouncementImages));
		expect(json.data).toHaveLength(5);
	});
	test(
		"--announcements-- #4b a new main image replaces the previous one (one main row, old files deleted)",
		async () => {
			const imagesOf = async () =>
				(
					await getJson<APIResponse["Announcements.getImagesById"]>(
						await useTestAPI("Announcements.getImagesById", { UrlArgs: { id: newAnnouncementId as number } }),
					)
				).data;
			const before = await imagesOf();
			const oldMain = before.find((i) => i.is_main);
			expect(oldMain).toBeDefined();
			// Stored names are versioned: `<base>-<base36>.<ext>`, never the uploaded name itself.
			expect(oldMain!.name).not.toBe(mainImage);

			const fileType = MIMETypeMap[mainImage.split(".").pop() as string];
			const data = new File([fs.readFileSync(path.join(process.cwd(), "notAssets", mainImage))], mainImage, { type: fileType });
			const res = await useTestAPI("Announcements.postImage", {
				RequestObject: { name: mainImage, announcement_id: newAnnouncementId as number, is_main: true, fileType, fileData: data },
			});
			const json = await getJson<APIResponse["Announcements.postImage"]>(res);
			expectBody(json, z.object({ insertId: z.number() }));

			const after = await imagesOf();
			expect(after).toHaveLength(before.length);
			const mains = after.filter((i) => i.is_main);
			expect(mains).toHaveLength(1);
			expect(mains[0].id).toBe(json.data.insertId);
			expect(mains[0].name).not.toBe(oldMain!.name);
			const folder = `anakoinoseis/images/${newAnnouncementId}/`;
			expect(await fetchBucketFile(folder + mains[0].name)).not.toBeNull();
			expect(await fetchBucketFile(folder + oldMain!.name)).toBeNull();
			expect(await fetchBucketFile(folder + "thumb_" + oldMain!.name)).toBeNull();
			newImageIds = newImageIds.filter((id) => id !== oldMain!.id).concat(json.data.insertId);
		},
		{ timeout: 20000 },
	);
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
		expectBody(json, z.array(z_AnnouncementImages));
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
		expect(sitemapStr).toContain(announcementPath(newTitle));
		expect(sitemapStr).not.toContain(announcementPath(announcement.title));
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
		expect(sitemapStr).not.toContain(announcementPath(newTitle));
	});
}

announcementsTest();

test("--announcements--", async () => {
	const res = await useTestAPI("Announcements.get");

	const json = await getJson<APIResponse["Announcements.get"]>(res);
	expectBody(json, z.array(z_Announcements));
});

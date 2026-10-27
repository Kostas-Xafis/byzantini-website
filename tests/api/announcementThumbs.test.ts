import { afterAll, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import { readJpegOrientation } from "@lib/imageOrientation";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { fetchBucketFile, getJson, useTestAPI } from "../testHelpers.ts";

// A phone photo stores portrait shots as landscape pixels + an EXIF orientation tag. The thumbnail must come
// out upright (the tag applied to the pixels), never sideways — lib/images.ts, lib/imageOrientation.ts.

/** Big-endian 16-bit read. */
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];

/** The JPEG's own segments without its APP1 (EXIF/XMP) blocks, then the rest of the file. */
function stripApp1(jpeg: Uint8Array): Uint8Array {
	const kept: number[] = [0xff, 0xd8];
	let pos = 2;
	while (pos + 4 <= jpeg.length && u16(jpeg, pos) !== 0xffda) {
		const end = pos + 2 + u16(jpeg, pos + 2);
		if (u16(jpeg, pos) !== 0xffe1) kept.push(...jpeg.subarray(pos, end));
		pos = end;
	}
	return new Uint8Array([...kept, ...jpeg.subarray(pos)]);
}

/** `jpeg` with a minimal EXIF block (little-endian IFD0 holding only the orientation tag) right after SOI. */
function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
	const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
	const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
	const app1 = [0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
	const body = stripApp1(jpeg);
	return new Uint8Array([0xff, 0xd8, ...app1, ...body.subarray(2)]);
}

/** Pixel size from the JPEG's frame header (SOFn). */
function jpegSize(jpeg: Uint8Array): { width: number; height: number } {
	let pos = 2;
	while (pos + 9 <= jpeg.length) {
		const marker = u16(jpeg, pos);
		if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
			return { height: u16(jpeg, pos + 5), width: u16(jpeg, pos + 7) };
		}
		pos += 2 + u16(jpeg, pos + 2);
	}
	throw new Error("no JPEG frame header");
}

// A landscape photo above the 40 KB threshold (smaller ones are stored as their own thumbnail).
const source = fs
	.readdirSync(path.join(process.cwd(), "notAssets"))
	.filter((f) => f.endsWith(".jpg"))
	.map((f) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "notAssets", f))))
	.find((bytes) => {
		const { width, height } = jpegSize(bytes);
		return bytes.length > 100 * 1024 && width > height * 1.2;
	});

let announcementId: number | undefined;
afterAll(async () => {
	if (announcementId) await useTestAPI("Announcements.delete", { RequestObject: [announcementId] });
});

test("--announcement thumbnails-- a photo tagged «turn 90°» gets an upright thumbnail", async () => {
	if (!source) throw new Error("notAssets/ needs a landscape .jpg above 100 KB");
	const res = await useTestAPI("Announcements.post", {
		RequestObject: { title: "Orientation test " + Date.now(), content: "Δοκιμή προσανατολισμού.", date: Date.now(), links: "" },
	});
	announcementId = (await getJson<APIResponse["Announcements.post"]>(res)).data.insertId;

	const tagged = withOrientation(source, 6); // shows as portrait in a browser
	expect(readJpegOrientation(tagged)?.orientation).toBe(6);
	const upload = await useTestAPI("Announcements.postImage", {
		RequestObject: {
			name: "portrait.jpg",
			announcement_id: announcementId,
			is_main: true,
			fileType: "image/jpeg",
			fileData: new File([tagged], "portrait.jpg", { type: "image/jpeg" }),
		},
	});
	expect(upload.status).toBe(200);

	const images = await getJson<APIResponse["Announcements.getImagesById"]>(
		await useTestAPI("Announcements.getImagesById", { UrlArgs: { id: announcementId } }),
	);
	const name = images.data.find((img) => !img.name.startsWith("thumb_"))?.name;
	const thumb = await fetchBucketFile(`anakoinoseis/images/${announcementId}/thumb_${name}`);
	expect(thumb).not.toBeNull();

	const stored = jpegSize(source);
	const thumbBytes = new Uint8Array(thumb as ArrayBuffer);
	const { width, height } = jpegSize(thumbBytes);
	// Upright: the stored landscape pixels turned a quarter → a portrait thumbnail, same proportions.
	expect(height).toBeGreaterThan(width);
	expect(Math.abs(width / height - stored.height / stored.width)).toBeLessThan(0.02);
	expect(height).toBeLessThanOrEqual(stored.width);
	// …and nothing left that would turn it again.
	expect(readJpegOrientation(thumbBytes)?.orientation ?? 1).toBe(1);
}, 20000);

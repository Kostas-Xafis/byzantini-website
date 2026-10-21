import { isInlineType, isPublicBucketKey, isSafeFileName, isThumbSourceType, isUploadImageType, thumbnailKey, thumbnailWidth } from "@lib/bucket/publicFiles";
import { expect, test } from "bun:test";

test("public bucket keys: root files and the public folders only", () => {
	for (const key of [
		"poster.jpg",
		"fek-byzantini.pdf",
		"αφίσα_εγγραφών_2025.jpeg",
		"choir/choir_1.jpg",
		"anakoinoseis/images/12/a.jpg",
		"kathigites/cv/Χ.pdf",
		"emails/files/x.pdf",
	])
		expect(isPublicBucketKey(key), key).toBe(true);
	for (const key of [
		"",
		"html_templates/epitixis/epitixis_eggrafi.html",
		"pdf_templates/byz_template.pdf",
		"secret/notes.txt",
		"/poster.jpg",
		"choir/../html_templates/x.html",
		"anakoinoseis/images//a.jpg",
		"choir\\x.jpg",
		"poster\u0000.jpg",
	])
		expect(isPublicBucketKey(key), JSON.stringify(key)).toBe(false);
});

test("only raster images, PDFs and fonts are shown inline", () => {
	for (const type of ["image/jpeg", "image/png", "application/pdf", "font/ttf", "IMAGE/JPEG; x=1"]) expect(isInlineType(type), type).toBe(true);
	for (const type of ["image/svg+xml", "text/html", "text/html; charset=utf-8", "application/xml", "application/octet-stream", "", undefined])
		expect(isInlineType(type), String(type)).toBe(false);
});

test("uploads: raster images only, safe file names", () => {
	expect(isUploadImageType("image/png")).toBe(true);
	expect(isUploadImageType("image/svg+xml")).toBe(false);
	expect(isSafeFileName("φωτογραφία 1.jpg")).toBe(true);
	for (const name of ["", ".", "..", "a/b.jpg", "a\\b.jpg", "a\nb.jpg", "x".repeat(201)]) expect(isSafeFileName(name), JSON.stringify(name)).toBe(false);
});

test("teacher photo thumbnails: allowed widths, derived non-public keys", () => {
	expect(thumbnailWidth("320")).toBe(320);
	expect(thumbnailWidth("100")).toBe(320);
	expect(thumbnailWidth("481")).toBe(640);
	expect(thumbnailWidth("5000")).toBe(640);
	for (const raw of [null, "", "0", "-5", "abc", "1e3", "480.5", "999999"]) expect(thumbnailWidth(raw), String(raw)).toBe(null);

	expect(thumbnailKey("kathigites/picture/Χ Ψ.jpg", 480)).toBe("kathigites/thumbs/w480/Χ Ψ.jpg");
	expect(thumbnailKey("kathigites/picture/a.jpg", 500)).toBe(null);
	for (const key of ["kathigites/cv/a.pdf", "poster.jpg", "anakoinoseis/images/1/a.jpg", "kathigites/picture/../cv/a.pdf", "kathigites/picture/x/a.jpg"])
		expect(thumbnailKey(key, 480), key).toBe(null);
	// The variants are reachable only through `?w=` on their source.
	expect(isPublicBucketKey("kathigites/thumbs/w480/a.jpg")).toBe(false);

	expect(isThumbSourceType("image/jpeg")).toBe(true);
	for (const type of ["image/gif", "image/svg+xml", "application/pdf", undefined]) expect(isThumbSourceType(type), String(type)).toBe(false);
});

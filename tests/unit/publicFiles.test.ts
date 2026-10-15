import { isInlineType, isPublicBucketKey, isSafeFileName, isUploadImageType } from "@lib/bucket/publicFiles";
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

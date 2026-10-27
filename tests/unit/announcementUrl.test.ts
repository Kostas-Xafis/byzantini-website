import { describe, expect, test } from "bun:test";
import { announcementPath, announcementSlug, isLegacyAnnouncementSlug, requestedAnnouncementSlug } from "@utilities/announcementUrl";

const title = "Πτυχιακές εξετάσεις οργάνων παραδοσιακής μουσικής, 25 Ιουνίου 2026";

describe("announcement URLs", () => {
	test("the slug drops commas and the path is encoded and slash-terminated", () => {
		expect(announcementSlug(title)).toBe("Πτυχιακές εξετάσεις οργάνων παραδοσιακής μουσικής 25 Ιουνίου 2026");
		expect(announcementPath("Hello, World #1")).toBe("/sxoli/anakoinoseis/Hello%20World%20%231/");
		expect(announcementPath(title).endsWith("/")).toBe(true);
	});

	test("the canonical path reads back as the canonical slug", () => {
		expect(isLegacyAnnouncementSlug(requestedAnnouncementSlug(announcementPath(title)), title)).toBe(false);
	});

	test("an old URL with the commas is legacy, with or without a trailing slash", () => {
		const old = "/sxoli/anakoinoseis/" + encodeURIComponent(title);
		expect(isLegacyAnnouncementSlug(requestedAnnouncementSlug(old), title)).toBe(true);
		expect(isLegacyAnnouncementSlug(requestedAnnouncementSlug(old + "/"), title)).toBe(true);
	});

	test("a malformed escape keeps the raw segment instead of throwing", () => {
		expect(requestedAnnouncementSlug("/sxoli/anakoinoseis/100%/")).toBe("100%");
	});
});

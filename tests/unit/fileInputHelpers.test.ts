/** `acceptHint` / `shortName` of the file fields (src/components/input/fileNames.ts — plain TS, no Solid/JSX). */
import { expect, test } from "bun:test";
import { acceptHint, shortName } from "../../src/components/input/fileNames";

test("acceptHint turns an accept list into a Greek/short hint", () => {
	expect(acceptHint(undefined)).toBe("");
	expect(acceptHint("")).toBe("");
	expect(acceptHint(".pdf")).toBe("PDF");
	expect(acceptHint("image/*")).toBe("εικόνα");
	expect(acceptHint("image/png")).toBe("PNG");
	expect(acceptHint("image/*, .pdf")).toBe("εικόνα, PDF");
});

test("shortName keeps short names and shortens long ones around the extension", () => {
	expect(shortName("a.png")).toBe("a.png");
	const out = shortName("Ι. Ναός Αγίας Τριάδος Κηφισιάς και άλλα πολλά.jpeg");
	expect(out.length).toBeLessThanOrEqual(28);
	expect(out.endsWith(".jpeg")).toBe(true);
	expect(out).toContain("…");
	expect(shortName("x".repeat(40), 10).length).toBe(10);
	expect(shortName("x".repeat(40), 10)).toContain("…");
});

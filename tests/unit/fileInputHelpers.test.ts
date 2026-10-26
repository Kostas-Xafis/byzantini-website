/** `acceptHint` / `shortName` of FileInput.solid.tsx (importing the module only loads Solid; nothing renders). */
import { expect, mock, test } from "bun:test";

// The component's imports reach pdf.client (a jsDelivr URL import bun test cannot resolve); stub it.
mock.module("../../lib/pdf.client", () => ({ PDF: {} }));
const { acceptHint, shortName } = await import("../../src/components/input/FileInput.solid");

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

/**
 * Unit tests for lib/bucket/fileNames.ts — the versioned names of the admin uploads
 * (`<base>-<base36 timestamp>.<ext>`), which must stay public-servable and parse back to their base.
 */
import { expect, test } from "bun:test";
import { extensionOfType, fileBaseName, safeBaseName, splitFileName, versionedFileName } from "@lib/bucket/fileNames";
import { isPublicBucketKey, isSafeFileName } from "@lib/bucket/publicFiles";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

test("versionedFileName appends an 8-digit base36 version before the extension", () => {
	const name = versionedFileName("Ι. Ναός Αγίας Τριάδος Κηφισιάς", "jpeg", NOW);
	expect(name).toBe(`Ι. Ναός Αγίας Τριάδος Κηφισιάς-${NOW.toString(36)}.jpeg`);
	expect(NOW.toString(36)).toHaveLength(8);
	expect(versionedFileName("Γιώργος", "", NOW)).toBe(`Γιώργος-${NOW.toString(36)}`);
});

test("every upload gets a different name", () => {
	expect(versionedFileName("Γιώργος Παπαδόπουλος", "png", NOW)).not.toBe(versionedFileName("Γιώργος Παπαδόπουλος", "png", NOW + 1));
});

test("fileBaseName strips the extension and the version — and reads names stored before versioning", () => {
	expect(fileBaseName(versionedFileName("Ι. Ναός Αγίας Τριάδος", "jpeg", NOW))).toBe("Ι. Ναός Αγίας Τριάδος");
	expect(fileBaseName("Γιώργος Παπαδόπουλος.png")).toBe("Γιώργος Παπαδόπουλος");
	expect(fileBaseName("Ι. Ναός Αγίας Τριάδος.jpeg")).toBe("Ι. Ναός Αγίας Τριάδος");
	expect(fileBaseName("Χωρίς επέκταση")).toBe("Χωρίς επέκταση");
});

test("splitFileName splits at the last dot", () => {
	expect(splitFileName("Ι. Ναός.v2.jpeg")).toEqual({ stem: "Ι. Ναός.v2", ext: "jpeg" });
	expect(splitFileName(".hidden")).toEqual({ stem: ".hidden", ext: "" });
	expect(splitFileName("plain")).toEqual({ stem: "plain", ext: "" });
});

test("safeBaseName keeps the name one key segment", () => {
	expect(safeBaseName("Α/Β\\Γ\n Δ")).toBe("Α Β Γ Δ");
	expect(safeBaseName("  ")).toBe("file");
	expect(safeBaseName("..")).toBe("file");
	expect(safeBaseName("α".repeat(400))).toHaveLength(150);
});

test("versioned names are safe file names and public keys under every upload folder", () => {
	for (const base of ["Ι. Ναός Αγίας Τριάδος Κηφισιάς", "Γιώργος Παπαδόπουλος", "x/../y", "α".repeat(400)]) {
		const name = versionedFileName(base, "jpeg", NOW);
		expect(isSafeFileName(name)).toBe(true);
		for (const prefix of ["spoudastiria/", "kathigites/picture/", "kathigites/cv/", "anakoinoseis/images/12/"]) {
			expect(isPublicBucketKey(prefix + name)).toBe(true);
		}
	}
});

test("extensionOfType", () => {
	expect(extensionOfType("image/jpeg")).toBe("jpeg");
	expect(extensionOfType("application/pdf")).toBe("pdf");
	expect(extensionOfType("image/svg+xml")).toBe("svg");
});

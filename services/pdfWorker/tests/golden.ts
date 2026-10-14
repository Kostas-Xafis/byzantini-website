import { expect } from "bun:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Golden-hash helpers shared by the worker suite (tests/pdf.test.ts) and the site's
 * `/api/pdf` suite (tests/api/pdf.test.ts at the repo root).
 *
 * The worker's output is a pure function of the request (no metadata timestamps, the school year comes
 * from `registration_year`), so every fixture has one exact SHA-256. A mismatch means the PDF changed:
 * if the change is intended, regenerate with `UPDATE_GOLDEN=1` (worker suite) and inspect the files it
 * writes to tests/__output__/ before committing the new golden.json.
 */
const TESTS_DIR = import.meta.dir;
const GOLDEN_FILE = join(TESTS_DIR, "fixtures/golden.json");
export const OUTPUT_DIR = join(TESTS_DIR, "__output__");
export const ASSETS_DIR = join(TESTS_DIR, "../assets");

export const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

export function sha256(bytes: ArrayBuffer | Uint8Array): string {
	return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

export async function readGolden(): Promise<Record<string, string>> {
	const file = Bun.file(GOLDEN_FILE);
	return (await file.exists()) ? await file.json() : {};
}

export async function writeGolden(hashes: Record<string, string>): Promise<void> {
	const sorted = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
	await Bun.write(GOLDEN_FILE, JSON.stringify(sorted, null, "\t") + "\n");
}

/** Writes a generated PDF to tests/__output__/ (gitignored) so a golden update can be inspected by eye. */
export async function saveOutput(name: string, bytes: ArrayBuffer | Uint8Array): Promise<void> {
	await mkdir(OUTPUT_DIR, { recursive: true });
	await Bun.write(join(OUTPUT_DIR, `${name}.pdf`), bytes);
}

/**
 * Structural checks that fail on a blank, empty, truncated or unfilled PDF independently of the hash
 * (so a broken golden can never be "accepted" silently): a parseable PDF with the expected page count,
 * the DidactGothic font embedded (the worker draws every field with it) and larger than the bare template.
 */
export async function expectFilledPdf(bytes: ArrayBuffer | Uint8Array, { pages = 1 }: { pages?: number } = {}): Promise<void> {
	const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	expect(data.byteLength).toBeGreaterThan(0);
	const text = new TextDecoder("latin1").decode(data);
	expect(text.startsWith("%PDF-")).toBe(true);
	expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

	const doc = await PDFDocument.load(data, { updateMetadata: false });
	expect(doc.getPageCount()).toBe(pages);
	// One DidactGothic font object per page (each filled page embeds its own copy).
	const didact = doc.context
		.enumerateIndirectObjects()
		.filter(([, obj]) => obj instanceof PDFDict && obj.get(PDFName.of("Type"))?.toString() === "/Font")
		.filter(([, obj]) => String((obj as PDFDict).get(PDFName.of("BaseFont")) ?? "").includes("DidactGothic"));
	expect(didact.length, "embedded DidactGothic fonts").toBeGreaterThanOrEqual(pages);

	// Every page carries a template (≥ the smallest one) plus its embedded font (~75 KB compressed):
	// a PDF without the font program or the filled fields falls under this bound.
	expect(data.byteLength).toBeGreaterThan(pages * ((await smallestTemplateSize()) + 40_000));
}

let smallestTemplate: number | undefined;
async function smallestTemplateSize(): Promise<number> {
	if (smallestTemplate === undefined) {
		const dir = join(ASSETS_DIR, "pdf_templates");
		const sizes = await Promise.all(["byz", "par", "eur"].map((t) => Bun.file(join(dir, `${t}_template.pdf`)).size));
		smallestTemplate = Math.min(...sizes);
	}
	return smallestTemplate;
}

/**
 * Ambient declarations for the pdf-lib API used by this worker.
 *
 * pdf-lib ships typings that re-export from "pdf-lib/src/..." — its raw TS
 * source, which does not typecheck under modern strict/isolatedModules
 * settings (and needs a `pako` declaration). The runtime behavior is covered
 * by the worker smoke tests; these declarations cover the used surface only.
 * tsconfig "paths" redirects the two modules here.
 */

declare module "pdf-lib" {
	export interface PDFFont {
		readonly [key: string]: unknown;
	}

	export interface PDFPage {
		drawText(text: string, options: { x: number; y: number; size: number; font: PDFFont }): void;
	}

	export class PDFDocument {
		static create(): Promise<PDFDocument>;
		static load(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocument>;
		registerFontkit(fontkit: unknown): void;
		embedFont(bytes: ArrayBuffer | Uint8Array): Promise<PDFFont>;
		getPages(): PDFPage[];
		getPageIndices(): number[];
		copyPages(srcDoc: PDFDocument, indices: number[]): Promise<PDFPage[]>;
		addPage(page: PDFPage): void;
		save(): Promise<Uint8Array>;
	}
}

declare module "@pdf-lib/fontkit" {
	const fontkit: unknown;
	export default fontkit;
}

/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

// 💖💖💖💖 All the types without the MBytes of added js to the bundle!!!!!
declare global {
	interface Window {
		XLSX: typeof import("xlsx");
		printJS: typeof import("print-js");
		pdfjsLib: typeof import("pdfjs-dist");
		zip: typeof import("client-zip");
	}
}
export {};

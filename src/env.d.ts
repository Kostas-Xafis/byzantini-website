/// <reference types="astro/client" />
type AdvancedRuntime = import('@astrojs/cloudflare').AdvancedRuntime;

// 💖💖💖💖 All the types without the MBytes of added js!!!!!

declare namespace App {
	interface Locals extends AdvancedRuntime { }
}

declare global {
	interface Window {
		fontkit: typeof import("@pdf-lib/fontkit");
		PDFLib: typeof import("pdf-lib");
		XLSX: typeof import("xlsx");
	}
	interface App {
		ZIP: ZIP;
	}
}

export { }

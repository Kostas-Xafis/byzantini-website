/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
type ENV = {
	S3_BUCKET: R2Bucket;
};
type Runtime = import('@astrojs/cloudflare').AdvancedRuntime<ENV>;


declare namespace App {
	interface Locals extends Runtime {
		user: {
			name: string;
			surname: string;
		};
	}
}


// 💖💖💖💖 All the types without the MBytes of added js to the bundle!!!!!
declare global {
	interface Window {
		fontkit: typeof import("@pdf-lib/fontkit");
		PDFLib: typeof import("pdf-lib");
		XLSX: typeof import("xlsx");
	}
}

export { default as imageCompression } from "browser-image-compression";
export { default as zip } from "client-zip";
export { };

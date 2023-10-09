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

interface CustomEventMap {
	emptyFileRemove: CustomEvent<string>;
}

// 💖💖💖💖 All the types without the MBytes of added js!!!!!
declare global {
	interface Window {
		fontkit: typeof import("@pdf-lib/fontkit");
		PDFLib: typeof import("pdf-lib");
		XLSX: typeof import("xlsx");
	}
	interface App {
		ZIP: ZIP;
	}
	interface Document { //adds definition to Document, but you can do the same with HTMLElement
		addEventListener<K extends keyof CustomEventMap>(type: K,
			listener: (this: Document, ev: CustomEventMap[K]) => void): void;
		dispatchEvent<K extends keyof CustomEventMap>(ev: CustomEventMap[K]): void;
	}
}

export { };

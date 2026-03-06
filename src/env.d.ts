import type { EnvironmentVariables } from "../types/envVars";

type R2Bucket = import('@cloudflare/workers-types/experimental').R2Bucket;
type ENV = {
	S3_BUCKET: R2Bucket;
};

type Runtime = import('@astrojs/cloudflare').Runtime<EnvironmentVariables>;


// 💖💖💖💖 All the types without the MBytes of added js to the bundle!!!!!
declare global {
	namespace App {
		interface Locals extends Runtime { }
	}
	interface Window {
		XLSX: typeof import("xlsx");
		printJS: typeof import("print-js");
		pdfjsLib: typeof import("pdfjs-dist");
		zip: typeof import("client-zip");
	}
}
export { };

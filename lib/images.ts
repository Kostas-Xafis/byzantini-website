import type { ImageOutputOptions, ImagesBinding, ReadableStream as WorkersReadableStream } from "@cloudflare/workers-types";
import { runtimeEnv } from "@env/runtime";

/**
 * Cloudflare Images-backed thumbnail generation.
 *
 * Replacement for the retired `services/imageCompression` Docker/Cloud Run
 * service (Bun + sharp). The old service received raw image bytes and returned
 * a downscaled copy when the source exceeded ~40 KB; the same behaviour is now
 * implemented in-process on the `IMAGES` binding (declared in `wrangler.jsonc`,
 * simulated locally by miniflare during `astro dev`).
 *
 * Storage still goes through `Bucket` — this module only produces bytes.
 */

/** Target size of the old sharp service (40 KB). */
export const THUMB_MAX_BYTES = 40 * 1024;

export interface ThumbResult {
	bytes: ArrayBuffer;
	contentType: string;
}

/** Output formats the Images binding can produce, keyed by the detected input format. */
const OUTPUT_FORMATS: Record<string, ImageOutputOptions["format"]> = {
	"image/jpeg": "image/jpeg",
	"image/png": "image/png",
	"image/webp": "image/webp",
	"image/avif": "image/avif",
	"image/gif": "image/gif",
};

const bufferToStream = (bytes: ArrayBuffer): WorkersReadableStream<Uint8Array> =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(bytes));
			controller.close();
		},
	}) as unknown as WorkersReadableStream<Uint8Array>;

const imagesBinding = (): ImagesBinding => {
	const images = runtimeEnv?.IMAGES as ImagesBinding | undefined;
	if (!images) throw new Error("Η υπηρεσία επεξεργασίας εικόνων (IMAGES binding) δεν είναι διαθέσιμη");
	return images;
};

/**
 * Produce the `thumb_*` variant of an announcement image, mirroring the old
 * sharp service:
 *
 * - Sources of `THUMB_MAX_BYTES` or less are returned as-is (the old service
 *   never re-encoded them).
 * - Larger sources are resized with the same `sqrt(size / 40KB) / 2` shrink
 *   factor; the output format follows the input format (as sharp did).
 * - `fit: "scale-down"` intentionally avoids the old service's accidental
 *   upscaling of images just above the 40 KB threshold.
 * - SVG and other dimension-less inputs are returned as-is.
 */
export const compressImageForThumb = async (source: ArrayBuffer, originalContentType: string): Promise<ThumbResult> => {
	if (source.byteLength <= THUMB_MAX_BYTES) {
		return { bytes: source, contentType: originalContentType };
	}

	const images = imagesBinding();
	const info = await images.info(bufferToStream(source));
	const outputFormat = OUTPUT_FORMATS[info.format];
	// SVG carries no width/height; unknown formats have no output mapping.
	if (!outputFormat || !("width" in info) || !info.width || !info.height) {
		return { bytes: source, contentType: originalContentType };
	}

	const shrinkFactor = Math.sqrt(source.byteLength / THUMB_MAX_BYTES) / 2;
	const result = await images
		.input(bufferToStream(source))
		.transform({
			width: Math.floor(info.width / shrinkFactor),
			height: Math.floor(info.height / shrinkFactor),
			fit: "scale-down",
		})
		.output({ format: outputFormat, quality: 80 }); // sharp's default JPEG quality

	return {
		bytes: await result.response().arrayBuffer(),
		contentType: result.contentType(),
	};
};

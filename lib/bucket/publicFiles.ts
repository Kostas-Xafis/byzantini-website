/**
 * What the site's catch-all (`src/pages/[...slug].ts`) may serve from the R2 bucket, and how.
 *
 * The bucket also holds private files — email templates (`html_templates/`, read by the emails worker through
 * its own binding) and the PDF form templates (`pdf_templates/`, bundled in the PDF worker) — so only the
 * public areas below are served: files at the bucket root (posters, ΦΕΚ, the font) and the folders the site and
 * its emails link to. Anything else answers 404.
 *
 * Files are served with their stored Content-Type and `nosniff`. Only raster images, PDFs and fonts are shown
 * inline; any other type (HTML, SVG, XML, unknown) is a sandboxed download, so an uploaded file can never run
 * script on the site's origin.
 */

/** Folders whose files are public (keys at the bucket root are public too). */
export const PUBLIC_BUCKET_PREFIXES = ["anakoinoseis/images/", "kathigites/picture/", "kathigites/cv/", "spoudastiria/", "choir/", "emails/files/"] as const;

/** Types served inline. */
const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "application/pdf"]);

export function isPublicBucketKey(key: string): boolean {
	if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\")) return false;
	if (/[\u0000-\u001f\u007f]/.test(key)) return false;
	const segments = key.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
	return segments.length === 1 || PUBLIC_BUCKET_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Whether a stored Content-Type may be displayed inline (otherwise: sandboxed attachment). */
export function isInlineType(contentType: string | undefined): boolean {
	const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
	return INLINE_TYPES.has(type) || type.startsWith("font/");
}

/** Raster image types accepted by the admin uploads (SVG is not: it can carry script). */
export const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
/** Largest accepted upload (images, CVs). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadImageType = (typeof UPLOAD_IMAGE_TYPES)[number];
export const isUploadImageType = (type: string): type is UploadImageType => (UPLOAD_IMAGE_TYPES as readonly string[]).includes(type);

/** A file name that is safe as the last segment of a bucket key and a URL. */
export const isSafeFileName = (name: string): boolean =>
	name.length > 0 && name.length <= 200 && name !== "." && name !== ".." && !/[\/\\\u0000-\u001f\u007f]/.test(name);

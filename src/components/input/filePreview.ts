import type { AnyRecord } from "@_types/global";
import type { FileProxy } from "@lib/fileHandling.client";
import { createIcon } from "@lib/icons";

type PreviewOptions = {
	alt?: string;
	/** Align the picture to its top edge (portraits, a PDF's first page). */
	top?: boolean;
};

/**
 * Preview element for the admin file inputs (`filePreview` of a file/multifile field).
 *
 * - A stored file (proxy) loads from `storedUrl`, with a cache-busting query for files stored before uploads got versioned
 *   names (a file replaced under the same name must not show the old picture). A stored PDF is fetched from `storedUrl`
 *   and its first page rendered (`toImageUrl`).
 * - A new file is rendered locally: an object URL (revoked once loaded) or a PDF's first page.
 *
 * The element is returned at once and filled in when ready — no lookup by id after a timeout, so the preview cannot miss
 * its element when the modal mounts slowly. A file that cannot be previewed falls back to an icon.
 */
export function filePreviewImage<T extends AnyRecord>(file: FileProxy<T>, storedUrl?: (file: FileProxy<T>) => string, options: PreviewOptions = {}) {
	const img = document.createElement("img");
	img.alt = options.alt ?? file.getName();
	img.decoding = "async";
	img.className = "h-full w-full object-cover" + (options.top ? " object-top" : "");
	img.addEventListener("error", () => img.replaceWith(previewFallback(file.getName())), { once: true });

	const stored = file.isProxy() && storedUrl ? storedUrl(file) : undefined;
	if (stored && !file.getName().toLowerCase().endsWith(".pdf")) {
		img.src = stored + "?v=" + Date.now();
	} else {
		file.toImageUrl(stored)
			.then((src) => {
				img.src = src;
				if (src.startsWith("blob:")) img.addEventListener("load", () => URL.revokeObjectURL(src), { once: true });
			})
			.catch(() => img.replaceWith(previewFallback(file.getName())));
	}
	return img;
}

function previewFallback(name: string) {
	const box = document.createElement("div");
	box.className = "grid h-full w-full place-items-center bg-surface-muted text-ink-muted";
	box.appendChild(createIcon(name.toLowerCase().endsWith(".pdf") ? "file-pdf" : "file-image", { class: "text-5xl opacity-60" }));
	return box;
}

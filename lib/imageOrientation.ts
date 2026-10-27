/**
 * EXIF orientation of JPEG photos (pure, client-safe; unit-tested in tests/unit/imageOrientation.test.ts).
 *
 * Phones store a portrait photo as landscape pixels plus an EXIF `Orientation` tag that says how to turn it.
 * Browsers honour the tag, so the uploaded photo itself shows upright — but a resized copy that drops the tag
 * without applying it comes out sideways (the January 2026 thumbnails, made by the old sharp service).
 *
 * `lib/images.ts` therefore never relies on the image service to apply the tag (production Cloudflare Images
 * does, the local miniflare emulation does not): it sets the tag to "upright" in a copy of the bytes and passes
 * the turn as explicit `rotate` / `flip` transforms, which behave the same everywhere.
 */

/** Where a JPEG's orientation tag is, and what it says (1–8; 1 = already upright). */
export interface JpegOrientation {
	orientation: number;
	/** Byte offset of the tag's 16-bit value. */
	offset: number;
	littleEndian: boolean;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const ORIENTATION_TAG = 0x0112;
const TYPE_SHORT = 3;

/** The orientation tag of a JPEG's EXIF block, or `null` (not a JPEG, no EXIF, no tag, or malformed). */
export function readJpegOrientation(bytes: Uint8Array): JpegOrientation | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const size = bytes.byteLength;
	if (size < 4 || view.getUint16(0) !== 0xffd8) return null;
	let pos = 2;
	// Walk the marker segments up to the image data; EXIF (APP1) comes before it.
	while (pos + 4 <= size) {
		const marker = view.getUint16(pos);
		if (marker >> 8 !== 0xff || marker === 0xffda || marker === 0xffd9) return null;
		const length = view.getUint16(pos + 2);
		if (length < 2 || pos + 2 + length > size) return null;
		if (marker === 0xffe1 && length >= 2 + 6 + 8 && EXIF_HEADER.every((b, i) => bytes[pos + 4 + i] === b)) {
			return readTiffOrientation(view, pos + 10, pos + 2 + length);
		}
		pos += 2 + length;
	}
	return null;
}

/** Reads the orientation entry of IFD0 in the TIFF structure at [tiff, end). */
function readTiffOrientation(view: DataView, tiff: number, end: number): JpegOrientation | null {
	const order = view.getUint16(tiff);
	if (order !== 0x4949 && order !== 0x4d4d) return null; // "II" little-endian, "MM" big-endian
	const littleEndian = order === 0x4949;
	if (view.getUint16(tiff + 2, littleEndian) !== 42) return null;
	const ifd = tiff + view.getUint32(tiff + 4, littleEndian);
	if (ifd + 2 > end) return null;
	const count = view.getUint16(ifd, littleEndian);
	for (let i = 0; i < count; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > end) return null;
		if (view.getUint16(entry, littleEndian) !== ORIENTATION_TAG) continue;
		if (view.getUint16(entry + 2, littleEndian) !== TYPE_SHORT) return null;
		const orientation = view.getUint16(entry + 8, littleEndian);
		return orientation >= 1 && orientation <= 8 ? { orientation, offset: entry + 8, littleEndian } : null;
	}
	return null;
}

/** A copy of `bytes` whose orientation tag says "upright" (1), so nothing turns the photo a second time. */
export function withUprightOrientation(bytes: ArrayBuffer, tag: JpegOrientation): ArrayBuffer {
	const copy = bytes.slice(0);
	new DataView(copy).setUint16(tag.offset, 1, tag.littleEndian);
	return copy;
}

export type OrientationTransform = { rotate: 90 | 180 | 270 } | { flip: "h" | "v" };

/**
 * The transforms that turn a photo with this EXIF orientation upright, to apply in order (rotations are
 * clockwise). 5 and 7 are the mirrored quarter turns: rotate, then flip horizontally.
 */
export function orientationTransforms(orientation: number): OrientationTransform[] {
	switch (orientation) {
		case 2:
			return [{ flip: "h" }];
		case 3:
			return [{ rotate: 180 }];
		case 4:
			return [{ flip: "v" }];
		case 5:
			return [{ rotate: 90 }, { flip: "h" }];
		case 6:
			return [{ rotate: 90 }];
		case 7:
			return [{ rotate: 270 }, { flip: "h" }];
		case 8:
			return [{ rotate: 270 }];
		default:
			return [];
	}
}

/** True when the orientation turns the photo a quarter, so its upright width is the stored height. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;

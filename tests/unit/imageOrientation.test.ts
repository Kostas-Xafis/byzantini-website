import { describe, expect, test } from "bun:test";
import { orientationTransforms, readJpegOrientation, swapsAxes, withUprightOrientation } from "@lib/imageOrientation";

/** SOI + an APP1 EXIF block whose IFD0 holds `entries` ([tag, type, value]) + EOI — enough for the parser. */
function jpegWithExif(entries: [number, number, number][], littleEndian = true, before: number[] = []): Uint8Array {
	const ifd: number[] = [];
	const u16 = (v: number) => (littleEndian ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
	const u32 = (v: number) =>
		littleEndian ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
	ifd.push(...u16(entries.length));
	for (const [tag, type, value] of entries) ifd.push(...u16(tag), ...u16(type), ...u32(1), ...u16(value), 0, 0);
	ifd.push(...u32(0)); // no next IFD
	const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...ifd];
	const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
	const length = payload.length + 2;
	return new Uint8Array([0xff, 0xd8, ...before, 0xff, 0xe1, length >> 8, length & 0xff, ...payload, 0xff, 0xd9]);
}

describe("readJpegOrientation", () => {
	test("finds the tag in little- and big-endian EXIF", () => {
		for (const le of [true, false]) {
			const bytes = jpegWithExif(
				[
					[0x010f, 2, 0], // Make (irrelevant entry before the orientation)
					[0x0112, 3, 6],
				],
				le,
			);
			const tag = readJpegOrientation(bytes);
			expect(tag?.orientation).toBe(6);
			expect(tag?.littleEndian).toBe(le);
		}
	});

	test("skips segments before the EXIF block", () => {
		const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]; // a short APP0 (JFIF) segment
		expect(readJpegOrientation(jpegWithExif([[0x0112, 3, 8]], true, app0))?.orientation).toBe(8);
	});

	test("null when there is nothing to read", () => {
		expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
		expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull(); // no EXIF before the image data
		expect(readJpegOrientation(jpegWithExif([[0x010f, 2, 0]]))).toBeNull(); // EXIF without the tag
		expect(readJpegOrientation(jpegWithExif([[0x0112, 3, 9]]))).toBeNull(); // out-of-range value
		expect(readJpegOrientation(jpegWithExif([[0x0112, 4, 6]]))).toBeNull(); // wrong type
		expect(readJpegOrientation(new Uint8Array(0))).toBeNull();
	});

	test("never reads past a truncated file", () => {
		const bytes = jpegWithExif([[0x0112, 3, 6]]);
		for (let cut = 0; cut < bytes.length - 2; cut++) {
			expect(() => readJpegOrientation(bytes.slice(0, cut))).not.toThrow();
		}
	});
});

describe("withUprightOrientation", () => {
	test("sets the tag to 1 in a copy and leaves the original alone", () => {
		for (const le of [true, false]) {
			const bytes = jpegWithExif([[0x0112, 3, 6]], le);
			const tag = readJpegOrientation(bytes)!;
			const upright = withUprightOrientation(bytes.buffer as ArrayBuffer, tag);
			expect(readJpegOrientation(new Uint8Array(upright))?.orientation).toBe(1);
			expect(readJpegOrientation(bytes)?.orientation).toBe(6);
			expect(upright.byteLength).toBe(bytes.byteLength);
		}
	});
});

describe("orientationTransforms", () => {
	test("maps every EXIF orientation to clockwise rotations and flips", () => {
		expect(orientationTransforms(1)).toEqual([]);
		expect(orientationTransforms(2)).toEqual([{ flip: "h" }]);
		expect(orientationTransforms(3)).toEqual([{ rotate: 180 }]);
		expect(orientationTransforms(4)).toEqual([{ flip: "v" }]);
		expect(orientationTransforms(5)).toEqual([{ rotate: 90 }, { flip: "h" }]);
		expect(orientationTransforms(6)).toEqual([{ rotate: 90 }]);
		expect(orientationTransforms(7)).toEqual([{ rotate: 270 }, { flip: "h" }]);
		expect(orientationTransforms(8)).toEqual([{ rotate: 270 }]);
		expect(orientationTransforms(0)).toEqual([]);
	});

	test("quarter turns swap width and height", () => {
		expect([1, 2, 3, 4, 5, 6, 7, 8].filter(swapsAxes)).toEqual([5, 6, 7, 8]);
	});
});

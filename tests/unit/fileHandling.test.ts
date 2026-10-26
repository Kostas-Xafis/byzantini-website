/**
 * Unit tests for the pure parts of lib/fileHandling.client.ts (`FileHandler`, the admin file inputs' state) and
 * the helpers of FileInput.solid.tsx. No DOM, no server.
 */
import { expect, mock, test } from "bun:test";

// fileHandling.client imports pdf.client, which loads client-zip from a jsDelivr URL (not resolvable in bun test).
// The PDF renderer is only used by toImageUrl, which these tests never call.
mock.module("../../lib/pdf.client", () => ({ PDF: {} }));
const { FileHandler } = await import("@lib/fileHandling.client");

const file = (name: string, type = "") => new File(["x"], name, { type });
const stored = (name: string) => FileHandler.createFileProxy(name);
let n = 0;
const prefix = () => `unit-${++n}-`;

test("accepts: extensions, wildcard and exact MIME types, case-insensitive", () => {
	expect(FileHandler.accepts(file("cv.pdf"), ".pdf")).toBe(true);
	expect(FileHandler.accepts(file("CV.PDF"), ".pdf")).toBe(true);
	expect(FileHandler.accepts(file("a.png", "image/png"), ".pdf")).toBe(false);
	expect(FileHandler.accepts(file("a.png", "image/png"), "image/*")).toBe(true);
	expect(FileHandler.accepts(file("a.pdf", "application/pdf"), "image/*")).toBe(false);
	expect(FileHandler.accepts(file("a.png", "image/png"), "image/png")).toBe(true);
	expect(FileHandler.accepts(file("a.jpg", "image/jpeg"), "image/png")).toBe(false);
});

test("accepts: mixed lists match any entry; empty or missing list accepts everything", () => {
	expect(FileHandler.accepts(file("a.pdf", "application/pdf"), "image/*, .pdf")).toBe(true);
	expect(FileHandler.accepts(file("a.jpg", "image/jpeg"), ".pdf,image/*")).toBe(true);
	expect(FileHandler.accepts(file("a.txt", "text/plain"), ".pdf,image/*")).toBe(false);
	expect(FileHandler.accepts(file("a.txt"), "")).toBe(true);
	expect(FileHandler.accepts(file("a.txt"), undefined)).toBe(true);
	expect(FileHandler.accepts(file("a.txt"), " , ")).toBe(false);
});

test("single file: replacing the stored file marks it for deletion and lists the new one", () => {
	const h = new FileHandler(prefix(), { isSingleFile: true, file: stored("old.jpg") }, { register: false });
	expect(h.getInitialFiles().map((f) => f.getName())).toEqual(["old.jpg"]);
	h.addFiles([file("new.png", "image/png")]);
	expect(h.getFiles().map((f) => f.getName())).toEqual(["new.png"]);
	expect(h.getNewFiles().map((f) => f.getName())).toEqual(["new.png"]);
	expect(h.getDeletedFiles().map((f) => f.getName())).toEqual(["old.jpg"]);
	expect(h.getInitialFiles()).toEqual([]);
});

test("single file: adding to an empty handler deletes nothing; replacing a new file deletes nothing", () => {
	const h = new FileHandler(prefix(), { isSingleFile: true }, { register: false });
	h.addFiles([file("a.png", "image/png")]);
	h.addFiles([file("b.png", "image/png")]);
	expect(h.getFiles().map((f) => f.getName())).toEqual(["b.png"]);
	expect(h.getDeletedFiles()).toEqual([]);
});

test("addFiles with no files is a no-op", () => {
	const h = new FileHandler(prefix(), { isSingleFile: true, file: stored("old.jpg") }, { register: false });
	h.addFiles([]);
	expect(h.getDeletedFiles()).toEqual([]);
	expect(h.getFiles().length).toBe(1);
});

test("removeFile: a stored file is marked for deletion, a new one just disappears", () => {
	const a = new FileHandler(prefix(), { isSingleFile: true, file: stored("old.jpg") }, { register: false });
	a.removeFile(0);
	expect(a.getFiles()).toEqual([]);
	expect(a.getDeletedFiles().map((f) => f.getName())).toEqual(["old.jpg"]);

	const b = new FileHandler(prefix(), { isSingleFile: true }, { register: false });
	b.addFiles([file("n.png", "image/png")]);
	b.removeFile(0);
	expect(b.getFiles()).toEqual([]);
	expect(b.getNewFiles()).toEqual([]);
	expect(b.getDeletedFiles()).toEqual([]);
});

test("removeFile out of range is a no-op", () => {
	const h = new FileHandler(prefix(), { isSingleFile: false, files: [stored("a.jpg"), stored("b.jpg")] }, { register: false });
	h.removeFile(-1);
	h.removeFile(2);
	expect(h.getFiles().length).toBe(2);
	expect(h.getDeletedFiles()).toEqual([]);
});

test("multi file: removing one stored file keeps the others", () => {
	const h = new FileHandler(prefix(), { isSingleFile: false, files: [stored("a.jpg"), stored("b.jpg")] }, { register: false });
	h.removeFile(0);
	expect(h.getFiles().map((f) => f.getName())).toEqual(["b.jpg"]);
	expect(h.getDeletedFiles().map((f) => f.getName())).toEqual(["a.jpg"]);
});

test("proxies with an empty name are dropped by the constructor", () => {
	const single = new FileHandler(prefix(), { isSingleFile: true, file: stored("") }, { register: false });
	expect(single.getFiles()).toEqual([]);
	const multi = new FileHandler(prefix(), { isSingleFile: false, files: [stored(""), stored("a.jpg")] }, { register: false });
	expect(multi.getFiles().map((f) => f.getName())).toEqual(["a.jpg"]);
});

test("getHandler returns an inert, unregistered handler for an unknown prefix", () => {
	const key = prefix() + "missing";
	const h = FileHandler.getHandler(key);
	expect(h.getFiles()).toEqual([]);
	expect(h.getNewFiles()).toEqual([]);
	expect(h.getDeletedFiles()).toEqual([]);
	h.addFiles([file("a.png", "image/png")]);
	// Not registered: the static lookups still see nothing.
	expect(FileHandler.getFiles(key)).toEqual([]);
	expect(FileHandler.getHandler(key)).not.toBe(h);
});

test("a registered handler is found by its prefix; unregister removes only itself", () => {
	const key = prefix() + "image";
	const first = new FileHandler(key, { isSingleFile: true });
	expect(FileHandler.getHandler(key)).toBe(first);

	const second = new FileHandler(key, { isSingleFile: true });
	first.unregister(); // replaced by `second`: must not remove it
	expect(FileHandler.getHandler(key)).toBe(second);

	second.addFiles([file("a.png", "image/png")]);
	expect(FileHandler.getNewFiles(key).length).toBe(1);
	second.unregister();
	expect(FileHandler.getFiles(key)).toEqual([]);
});

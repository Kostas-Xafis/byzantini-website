import { describeError, errorFingerprint, MAX_ERROR_MESSAGE, scrubErrorMessage } from "@lib/errors/describe";
import { expect, test } from "bun:test";

test("messages lose emails and long numbers, and are truncated", () => {
	expect(scrubErrorMessage("UNIQUE constraint failed for maria.p@example.gr ΑΜΚΑ 01019912345 id 42")).toBe(
		"UNIQUE constraint failed for <email> ΑΜΚΑ <number> id 42",
	);
	expect(scrubErrorMessage("a\n\n  b")).toBe("a b");
	const long = scrubErrorMessage("x ".repeat(500));
	expect(long.length).toBe(MAX_ERROR_MESSAGE);
	expect(long.endsWith("…")).toBe(true);
});

test("describeError keeps the class and one level of cause", () => {
	expect(describeError(new TypeError("bad"))).toEqual({ name: "TypeError", message: "bad" });
	expect(describeError(new Error("afterWrite failed", { cause: new RangeError("db 6912345678") }))).toEqual({
		name: "Error",
		message: "afterWrite failed ← RangeError: db <number>",
	});
	expect(describeError("plain")).toEqual({ name: "string", message: "plain" });
	expect(describeError(new Error(""))).toEqual({ name: "Error", message: "(χωρίς μήνυμα)" });
});

test("the fingerprint separates hosts, sources and statuses", () => {
	const base = { source: "Pupils.post", status: 500, name: "Error", message: "x", host: "musicschool-metamorfosi.gr" };
	expect(errorFingerprint(base)).toBe(errorFingerprint({ ...base }));
	expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, host: "localhost:4321" }));
	expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, source: "Pupils.enroll" }));
});

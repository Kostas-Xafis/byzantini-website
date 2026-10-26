import { jsonForScript } from "@utilities/safeJson";
import { expect, test } from "bun:test";

test("jsonForScript cannot close the script element", () => {
	const value = { name: "</script><script>alert(1)</script>", note: "a & b <!-- c -->", line: "x\u2028y\u2029z" };
	const json = jsonForScript(value);
	expect(json).not.toContain("<");
	expect(json).not.toContain(">");
	expect(json).not.toContain("&");
	expect(json).not.toMatch(/[\u2028\u2029]/);
	expect(JSON.parse(json)).toEqual(value);
});

test("jsonForScript leaves ordinary JSON unchanged", () => {
	const value = { "@type": "MusicSchool", name: "Σχολή Βυζαντινής Μουσικής", n: [1, 2] };
	expect(jsonForScript(value)).toBe(JSON.stringify(value));
});

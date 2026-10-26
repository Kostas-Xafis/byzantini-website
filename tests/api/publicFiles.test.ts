/**
 * The bucket catch-all (`src/pages/[...slug].ts`, rules in lib/bucket/publicFiles.ts) against the dev server's
 * local R2 (seeded by `bun run replicate:bucket`): public files keep their type and get `nosniff`, private
 * areas answer 404. Keys absent from the local bucket are skipped.
 */
import { expect, test } from "bun:test";
import { testEnv } from "../testHelpers";

const base = (testEnv.VITE_URL ?? "http://localhost:4321/").replace(/\/?$/, "/");
const get = (key: string) => fetch(base + key.split("/").map(encodeURIComponent).join("/"), { redirect: "manual" });

test("--files-- a public image is served inline with its type and nosniff", async () => {
	const res = await get("choir/choir_1.jpg");
	if (res.status === 404) return; // not in this local bucket
	expect(res.status).toBe(200);
	expect(res.headers.get("content-type")).toBe("image/jpeg");
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	expect(res.headers.get("content-disposition")).toBeNull();
	expect(res.headers.get("etag")).toBeTruthy();
});

test("--files-- private areas of the bucket are not served", async () => {
	for (const key of ["html_templates/epitixis/epitixis_eggrafi.html", "pdf_templates/byz_template.pdf"]) {
		const res = await get(key);
		expect(res.status, key).toBe(404);
		expect(await res.text()).not.toContain("{{");
	}
});

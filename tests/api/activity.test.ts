/**
 * «Ιστορικό ενεργειών» (lib/activity, lib/api/routes/activity.ts): successful changes by a signed-in
 * admin are recorded with who/what/target; reads are not; only the sysadmin and the owner can read it.
 */
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { rawAPI } from "../rawAPI";
import { getJson, testEnv, useTestAPI } from "../testHelpers";

const latest = async (filters: { category?: string; user_email?: string } = {}) =>
	(await getJson<APIResponse["Activity.list"]>(await useTestAPI("Activity.list", { RequestObject: filters }))).data;

test("--activity-- a change is recorded with the admin, a Greek label and its target; a read is not", async () => {
	const name = `Δοκιμαστικός χονδρέμπορος ${R.hex(4)}`;
	const created = await getJson<APIResponse["Wholesalers.post"]>(await useTestAPI("Wholesalers.post", { RequestObject: { name } }));
	const id = created.data.insertId as number;
	try {
		const [entry] = (await latest()).rows;
		expect(entry).toMatchObject({ endpoint: "Wholesalers.post", label: "Νέος χονδρέμπορος", summary: name });
		expect(entry!.user_email.toLowerCase()).toBe(testEnv.TEST_EMAIL!.toLowerCase());

		// A read that travels as POST adds nothing.
		await getJson(await useTestAPI("Wholesalers.getById", { RequestObject: [id] }));
		expect((await latest()).rows[0]!.id).toBe(entry!.id);
	} finally {
		await getJson(await useTestAPI("Wholesalers.delete", { RequestObject: [id] }));
	}
	const [deletion] = (await latest()).rows;
	expect(deletion).toMatchObject({ endpoint: "Wholesalers.delete", label: "Διαγραφή χονδρεμπόρων", summary: `#${id}` });
});

test("--activity-- filters by category and admin, and pages with a cursor", async () => {
	const books = await latest({ category: "Βιβλία" });
	for (const row of books.rows) expect(["Books", "Wholesalers"]).toContain(row.endpoint.split(".")[0]);
	expect((await latest({ category: "Δεν υπάρχει" })).rows).toEqual([]);

	const mine = await latest({ user_email: testEnv.TEST_EMAIL!.toLowerCase() });
	for (const row of mine.rows) expect(row.user_email.toLowerCase()).toBe(testEnv.TEST_EMAIL!.toLowerCase());

	const first = await latest();
	if (first.next !== null) {
		const second = (await getJson<APIResponse["Activity.list"]>(await useTestAPI("Activity.list", { RequestObject: { before: first.next } }))).data;
		expect(second.rows[0]!.id).toBeLessThan(first.rows[first.rows.length - 1]!.id + 1);
	}
	const admins = (await getJson<APIResponse["Activity.admins"]>(await useTestAPI("Activity.admins"))).data;
	expect(admins.map((email: string) => email.toLowerCase())).toContain(testEnv.TEST_EMAIL!.toLowerCase());
});

test("--activity-- needs a signed-in sysadmin or owner", async () => {
	expect((await rawAPI("POST", "/activity", {})).status).toBe(401);
	expect((await rawAPI("GET", "/activity/admins")).status).toBe(401);
});

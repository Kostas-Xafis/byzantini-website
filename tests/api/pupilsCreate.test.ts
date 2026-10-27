import { afterAll, expect, test } from "bun:test";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { rawAPI } from "../rawAPI.ts";
import { uniqueTestAm, withLocalDb } from "../localDb.ts";
import { getJson, useTestAPI } from "../testHelpers.ts";

// «Νέος μαθητής» in the Μαθητολόγιο (Pupils.create): the secretariat adds a pupil by hand — also to fill in the
// years before the online register, adding their old enrollments with Pupils.enroll.

const fakeAmka = () => `99${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`; // day 99: no real person
const pupil = (extra: Record<string, unknown> = {}) => ({
	last_name: "Μαθητής",
	first_name: "Δοκιμαστικός",
	fathers_name: "Δοκιμαστικός",
	email: `pupils.test.create.${Date.now().toString(36)}@example.com`,
	...extra,
});

const created: number[] = [];
afterAll(async () => {
	for (const id of created) await useTestAPI("Pupils.delete", { RequestObject: { id, unsubscribe: true } });
});

const create = async (body: Record<string, unknown>) => useTestAPI("Pupils.create", { RequestObject: body as never });

test("--pupils create-- without ΑΜ: a review code, flagged, and old enrollments can be added", async () => {
	const res = await create(pupil({ amka: fakeAmka(), birth_date: Date.UTC(2005, 2, 1) }));
	expect(res.status).toBe(200);
	const { id } = (await getJson<APIResponse["Pupils.create"]>(res)).data;
	created.push(id);

	const record = (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id } }))).data;
	expect(record.pupil.am).toBeNull();
	expect(record.pupil.orphan_code).toMatch(/^000-Ο\d+$/);
	expect(record.pupil.needs_review).toBe(true);
	expect(record.pupil.registration_url).toHaveLength(32);

	// A year before the online register.
	const enroll = await useTestAPI("Pupils.enroll", {
		RequestObject: {
			pupil_id: id,
			registration_year: "2019-2020",
			class_id: 0,
			class_year: "Α' Έτος",
			teacher_id: -1,
			instrument_id: 0,
			date: Date.UTC(2019, 8, 15),
			pass: true,
		},
	});
	expect(enroll.status).toBe(200);
	const after = (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id } }))).data;
	expect(after.enrollments.map((e) => e.registration_year)).toEqual(["2019-2020"]);
});

test("--pupils create-- with an ΑΜ: not flagged; the same ΑΜ or ΑΜΚΑ again is refused", async () => {
	const am = uniqueTestAm();
	const amka = fakeAmka();
	const res = await create(pupil({ am, amka }));
	expect(res.status).toBe(200);
	const { id } = (await getJson<APIResponse["Pupils.create"]>(res)).data;
	created.push(id);
	const row = withLocalDb((db) => db.query("SELECT am, orphan_code, needs_review FROM pupils WHERE id = ?").get(id));
	if (row) expect(row).toMatchObject({ am, orphan_code: "", needs_review: 0 });

	const sameAm = await create(pupil({ am, first_name: "Άλλος" }));
	expect(sameAm.status).toBe(409);
	const sameAmka = await create(pupil({ amka, first_name: "Άλλος" }));
	expect(sameAmka.status).toBe(409);
	const refusal = (await sameAmka.json()) as { error?: string; message?: string };
	expect(refusal.error ?? refusal.message).toContain("ΑΜΚΑ");
});

test("--pupils create-- names are required and the route needs a signed-in admin", async () => {
	// The route's own schema (useTestAPI validates with it before sending).
	await expect(create(pupil({ last_name: "  " }))).rejects.toThrow("Συμπληρώστε το επώνυμο");
	expect((await rawAPI("POST", "/pupils/create", pupil())).status).toBe(401);
});

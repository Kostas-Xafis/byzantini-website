import { afterAll, expect, test } from "bun:test";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { uniqueTestAm } from "../localDb.ts";
import { getJson, useTestAPI } from "../testHelpers.ts";

// A pupil who registered as new has no ΑΜ until the secretaries assign one (an orphan, `000-Ο…`). Their next
// registration must still find them: by ΑΜΚΑ alone in the lookup, and by ΑΜΚΑ in the public post — never by ΑΜΚΑ
// alone for a pupil who has an ΑΜ (Pupils.getByAm / Pupils.post, lib/api/routes/pupils.ts).

const fakeAmka = () => `99${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`; // day 99: no real person
const registration = (am: string, amka: string, firstName: string) => ({
	am,
	amka,
	first_name: firstName,
	last_name: "Μαθητής",
	fathers_name: "Δοκιμαστικός",
	birth_date: Date.UTC(2014, 4, 2),
	road: "Δοκιμαστική",
	number: 1,
	tk: 10000,
	region: "Δοκιμή",
	telephone: "-",
	cellphone: "6900000004",
	email: `pupils.test.noam.${R.hex(4)}@example.com`,
	registration_year: "2026-2027",
	class_year: "Υπό Κατάταξη",
	class_id: 0 as const,
	teacher_id: -1,
	instrument_id: 0,
	date: Date.now(),
	pass: false,
});

const created: number[] = [];
afterAll(async () => {
	for (const id of new Set(created)) await useTestAPI("Pupils.delete", { RequestObject: { id, unsubscribe: true } });
});

const register = async (am: string, amka: string, firstName: string) => {
	const res = await useTestAPI("Pupils.post", { RequestObject: registration(am, amka, firstName) }, false);
	expect(res.status).toBe(200);
	const { pupilId } = (await getJson<APIResponse["Pupils.post"]>(res)).data;
	created.push(pupilId);
	return pupilId;
};

test("--pupils without ΑΜ-- found by ΑΜΚΑ alone, and re-registering reuses the same pupil", async () => {
	const amka = fakeAmka();
	const pupilId = await register("000", amka, "Δοκιμαστικός");

	// Lookup without ΑΜ: the ΑΜΚΑ alone finds the pupil without ΑΜ.
	const found = await getJson<APIResponse["Pupils.getByAm"]>(await useTestAPI("Pupils.getByAm", { RequestObject: { amka } }, false));
	expect(found.data.pupil.id).toBe(pupilId);
	expect(found.data.pupil.am).toBeNull();

	// Next year's registration (again without ΑΜ, the first name typed differently) lands on the same pupil.
	const again = await register("000", amka, "Δοκιμαστικος");
	expect(again).toBe(pupilId);
	const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
	expect(record.data.enrollments).toHaveLength(2);
});

test("--pupils without ΑΜ-- the ΑΜΚΑ alone never finds a pupil who has an ΑΜ", async () => {
	const amka = fakeAmka();
	const am = uniqueTestAm();
	await register(String(am), amka, "Δοκιμαστικός");
	const alone = await useTestAPI("Pupils.getByAm", { RequestObject: { amka } }, false);
	expect(alone.status).toBe(404);
	const pair = await useTestAPI("Pupils.getByAm", { RequestObject: { am, amka } }, false);
	expect(pair.status).toBe(200);
});

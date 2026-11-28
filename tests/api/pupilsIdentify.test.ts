import { afterAll, expect, test } from "bun:test";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { rawAPI } from "../rawAPI.ts";
import { uniqueTestAm } from "../localDb.ts";
import { getJson, useTestAPI } from "../testHelpers.ts";

// Returning pupils on the public form (Pupils.identify + Pupils.post with the identity token, lib/api/routes/pupils.ts):
// a pupil from before ΑΜΚΑ was required is found by ΑΜ + phone or by name + phone, gives an ΑΜΚΑ on this registration,
// and a clash with another pupil's ΑΜΚΑ flags both for the secretaries instead of refusing.

const fakeAmka = () => `99${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`; // day 99: no real person
const fakeCell = () => `69${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const lastName = () => `Ταυτοποίηση${R.hex(3).replace(/\d/g, "")}`;

const created: number[] = [];
afterAll(async () => {
	for (const id of new Set(created)) await useTestAPI("Pupils.delete", { RequestObject: { id, unsubscribe: true } });
});

/** A pupil the secretariat added by hand (the register backfill's shape: no ΑΜΚΑ unless given). */
const createPupil = async (fields: { am?: number; amka?: string; cellphone: string; last_name: string }) => {
	const res = await useTestAPI("Pupils.create", {
		RequestObject: {
			first_name: "Δοκιμαστικός",
			fathers_name: "Δοκιμαστικός",
			birth_date: Date.UTC(2010, 0, 1),
			road: "Δοκιμαστική",
			number: 1,
			tk: 10000,
			region: "Δοκιμή",
			telephone: "-",
			email: `pupils.test.identify.${R.hex(4)}@example.com`,
			...fields,
		} as never,
	});
	expect(res.status).toBe(200);
	const { id } = (await getJson<APIResponse["Pupils.create"]>(res)).data;
	created.push(id);
	return id;
};

const registration = (identity: string | undefined, amka: string) => ({
	am: "000",
	amka,
	first_name: "Δοκιμαστικός",
	last_name: "Μαθητής",
	fathers_name: "Δοκιμαστικός",
	birth_date: Date.UTC(2010, 0, 1),
	road: "Δοκιμαστική",
	number: 1,
	tk: 10000,
	region: "Δοκιμή",
	telephone: "-",
	cellphone: "6900000005",
	email: `pupils.test.identify.${R.hex(4)}@example.com`,
	registration_year: "2026-2027",
	class_year: "Υπό Κατάταξη",
	class_id: 0 as const,
	teacher_id: -1,
	instrument_id: 0,
	date: Date.now(),
	pass: false,
	...(identity ? { identity } : {}),
});

const identify = (body: Record<string, unknown>) => rawAPI("POST", "/pupils/lookup", body);

test("--identify-- a pupil without ΑΜΚΑ is found by ΑΜ + phone and by name + phone; only the pre-fill fields come back", async () => {
	const am = uniqueTestAm();
	const cell = fakeCell();
	const last = lastName();
	const id = await createPupil({ am, cellphone: cell, last_name: last });

	const byAm = await identify({ by: "am", am, proof: `+30 ${cell.slice(0, 3)} ${cell.slice(3)}` });
	expect(byAm.status).toBe(200);
	const found = (await byAm.json()).data as APIResponse["Pupils.identify"];
	expect(found.am).toBe(String(am));
	expect(found.amka).toBe("");
	expect(found.token.length).toBeGreaterThan(20);
	expect(found.pupil.last_name).toBe(last);
	expect(Object.keys(found.pupil)).not.toContain("review_note");
	expect(Object.keys(found.pupil)).not.toContain("registration_url");
	expect(Object.keys(found.pupil)).not.toContain("id");

	const byName = await identify({ by: "name", first_name: "δοκιμαστικος", last_name: last.toUpperCase(), proof: cell });
	expect(byName.status).toBe(200);
	expect(((await byName.json()).data as APIResponse["Pupils.identify"]).am).toBe(String(am));

	expect((await identify({ by: "am", am, proof: "6911111111" })).status).toBe(404);
	expect((await identify({ by: "name", first_name: "Δοκιμ", last_name: last, proof: cell })).status).toBe(404);
	expect(id).toBeGreaterThan(0);
});

test("--identify-- a pupil with an ΑΜΚΑ needs the ΑΜΚΑ, not the phone", async () => {
	const am = uniqueTestAm();
	const cell = fakeCell();
	const amka = fakeAmka();
	await createPupil({ am, amka, cellphone: cell, last_name: lastName() });
	const byPhone = await identify({ by: "am", am, proof: cell });
	expect(byPhone.status).toBe(404);
	expect((await byPhone.json()).error).toContain("ΑΜΚΑ");
	const byAmka = await identify({ by: "am", am, proof: amka });
	expect(byAmka.status).toBe(200);
	expect(((await byAmka.json()).data as APIResponse["Pupils.identify"]).amka).toBe(amka);
	expect((await identify({ by: "am", am, proof: "123" })).status).toBe(400);
});

test("--identify-- the identified registration saves the new ΑΜΚΑ on that pupil", async () => {
	const am = uniqueTestAm();
	const cell = fakeCell();
	const id = await createPupil({ am, cellphone: cell, last_name: lastName() });
	const { token } = (await (await identify({ by: "am", am, proof: cell })).json()).data as APIResponse["Pupils.identify"];

	const amka = fakeAmka();
	const res = await useTestAPI("Pupils.post", { RequestObject: registration(token, amka) }, false);
	expect(res.status).toBe(200);
	expect((await getJson<APIResponse["Pupils.post"]>(res)).data.pupilId).toBe(id);
	const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id } }));
	expect(record.data.pupil.amka).toBe(amka);
	expect(record.data.enrollments).toHaveLength(1);
	expect(Boolean(record.data.pupil.needs_review)).toBe(false);
});

test("--identify-- an ΑΜΚΑ another pupil already holds is accepted and both are flagged for review", async () => {
	const amka = fakeAmka();
	const holder = await createPupil({ amka, cellphone: fakeCell(), last_name: lastName() });
	const am = uniqueTestAm();
	const cell = fakeCell();
	const id = await createPupil({ am, cellphone: cell, last_name: lastName() });
	const { token } = (await (await identify({ by: "am", am, proof: cell })).json()).data as APIResponse["Pupils.identify"];

	const res = await useTestAPI("Pupils.post", { RequestObject: registration(token, amka) }, false);
	expect(res.status).toBe(200);
	for (const pupilId of [id, holder]) {
		const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
		expect(Boolean(record.data.pupil.needs_review)).toBe(true);
		expect(record.data.pupil.review_note).toContain("πιθανό διπλότυπο");
	}
});

test("--identify-- a forged or expired identity is refused with 410", async () => {
	const res = await rawAPI("POST", "/pupils", registration("bm90LWEtdG9rZW4.c2lnbmF0dXJl", fakeAmka()));
	expect(res.status).toBe(410);
});

import { afterAll, expect, test } from "bun:test";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { uniqueTestAm, withLocalDb } from "../localDb.ts";
import { getJson, useTestAPI } from "../testHelpers.ts";

// New pupils (Pupils.post, lib/api/routes/pupils.ts): a "new student" gets the next ΑΜ at once; registering as new
// again with the same ΑΜΚΑ, surname and birth date lands on the same record; anyone else's ΑΜΚΑ is refused; an old
// record still without ΑΜ is numbered when it registers again.

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

/** The highest real ΑΜ in the local dev database (test fixtures sit at 9000+). */
const maxRealAm = () => withLocalDb((db) => (db.query("SELECT COALESCE(MAX(am), 0) AS m FROM pupils WHERE am < 9000").get() as { m: number }).m);

test("--new pupils-- a new student gets the next ΑΜ; registering as new again lands on the same pupil", async () => {
	const before = maxRealAm();
	const amka = fakeAmka();
	const res = await useTestAPI("Pupils.post", { RequestObject: registration("000", amka, "Δοκιμαστικός") }, false);
	expect(res.status).toBe(200);
	const { pupilId, am } = (await getJson<APIResponse["Pupils.post"]>(res)).data;
	created.push(pupilId);
	expect(am).not.toBeNull();
	if (before !== null) expect(am!).toBeGreaterThan(before);
	const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
	expect(record.data.pupil).toMatchObject({ am, orphan_code: "", needs_review: false });

	// Found by ΑΜ + ΑΜΚΑ, and by name + ΑΜΚΑ.
	expect((await useTestAPI("Pupils.identify", { RequestObject: { by: "am", am: am!, proof: amka } }, false)).status).toBe(200);
	const byName = await getJson<APIResponse["Pupils.identify"]>(
		await useTestAPI("Pupils.identify", { RequestObject: { by: "name", first_name: "Δοκιμαστικός", last_name: "Μαθητής", proof: amka } }, false),
	);
	expect(byName.data.am).toBe(String(am));

	// «Νέος μαθητής» again next year (the first name typed differently): the same pupil, no second ΑΜ.
	const again = await register("000", amka, "Δοκιμαστικος");
	expect(again).toBe(pupilId);
	const after = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
	expect(after.data.enrollments).toHaveLength(2);
});

test("--new pupils-- a new pupil can enroll in several classes the same year, on one pupil", async () => {
	const amka = fakeAmka();
	const first = await register("000", amka, "Δοκιμαστικός");
	const res = await useTestAPI(
		"Pupils.post",
		{ RequestObject: { ...registration("000", amka, "Δοκιμαστικός"), class_id: 1, class_year: "Υπό Κατάταξη" } },
		false,
	);
	expect(res.status).toBe(200);
	expect((await getJson<APIResponse["Pupils.post"]>(res)).data.pupilId).toBe(first);
});

test("--new pupils-- someone else's ΑΜΚΑ cannot enroll as new", async () => {
	const amka = fakeAmka();
	const am = uniqueTestAm();
	const holder = await register(String(am), amka, "Δοκιμαστικός");

	const other = { ...registration("000", amka, "Άλλος"), last_name: "Άλλος" };
	const res = await useTestAPI("Pupils.post", { RequestObject: other }, false);
	expect(res.status).toBe(409);
	const answer = await res.text();
	expect(answer).not.toContain(String(am)); // public route: it names nobody
	expect(answer).not.toContain("Μαθητής");

	// A typed ΑΜ nobody holds does not get around it either, and the pupil's own ΑΜ + ΑΜΚΑ still enrolls them.
	const otherAm = await useTestAPI("Pupils.post", { RequestObject: { ...other, am: String(uniqueTestAm()) } }, false);
	expect(otherAm.status).toBe(409);
	expect(await register(String(am), amka, "Δοκιμαστικός")).toBe(holder);

	const slots = withLocalDb((db) => db.query("SELECT COUNT(*) AS c FROM pupils WHERE amka = ?").get(amka) as { c: number });
	if (slots) expect(slots.c).toBe(1);
});

test("--new pupils-- a placeholder ΑΜΚΑ held by another pupil does not stop a new pupil", async () => {
	const placeholder = "0".repeat(11);
	const am = uniqueTestAm();
	const holder = await register(String(am), placeholder, "Δοκιμαστικός");
	const pupilId = await register("000", placeholder, `Δοκιμαστικός${R.hex(2)}`);
	expect(pupilId).not.toBe(holder);
	const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
	expect(record.data.pupil.am).not.toBeNull();
});

test("--new pupils-- an old record without ΑΜ is numbered when it registers again", async () => {
	const amka = fakeAmka();
	const pupilId = await register("000", amka, "Δοκιμαστικός");
	// As before automatic numbering: no ΑΜ.
	expect((await useTestAPI("Pupils.update", { RequestObject: { id: pupilId, am: null } })).status).toBe(200);

	const found = await getJson<APIResponse["Pupils.identify"]>(
		await useTestAPI("Pupils.identify", { RequestObject: { by: "name", first_name: "Δοκιμαστικός", last_name: "Μαθητής", proof: amka } }, false),
	);
	expect(found.data.am).toBe("");
	const res = await useTestAPI("Pupils.post", { RequestObject: { ...registration("000", amka, "Δοκιμαστικός"), identity: found.data.token } }, false);
	expect(res.status).toBe(200);
	const { am } = (await getJson<APIResponse["Pupils.post"]>(res)).data;
	expect(am).not.toBeNull();
	const record = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }));
	expect(record.data.pupil).toMatchObject({ am, orphan_code: "" });
});

const enrollmentIdsOf = async (pupilId: number) =>
	(await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }))).data.enrollments.map((e) => e.id);
const amOf = async (pupilId: number) => (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } }))).data.pupil;

test("--new pupils-- an unfinished registration gives its ΑΜ back, and the next new pupil fills the gap", async () => {
	const first = await register("000", fakeAmka(), "Δοκιμαστικός");
	const second = await register("000", fakeAmka(), "Δοκιμαστικός");
	const freed = (await amOf(first)).am!;
	expect((await amOf(second)).am).toBe(freed + 1);

	// The secretariat deletes the first pupil's only registration (this school year): the ΑΜ is given back.
	const del = await useTestAPI("Pupils.deleteEnrollments", { RequestObject: await enrollmentIdsOf(first) });
	expect(del.status).toBe(200);
	const released = await amOf(first);
	expect(released.am).toBeNull();
	expect(released.needs_review).toBe(true);
	expect(released.review_note).toContain(`Το ΑΜ ${freed} δόθηκε πίσω`);

	// The next new pupil gets that number, not one after the last.
	const third = await register("000", fakeAmka(), "Δοκιμαστικός");
	expect((await amOf(third)).am).toBe(freed);

	// «Νέα εγγραφή» for the pupil who gave the ΑΜ back numbers them again.
	const enroll = await useTestAPI("Pupils.enroll", {
		RequestObject: {
			pupil_id: first,
			registration_year: "2026-2027",
			class_id: 0,
			class_year: "Α' Έτος",
			teacher_id: -1,
			instrument_id: 0,
			date: Date.now(),
			pass: false,
		},
	});
	expect(enroll.status).toBe(200);
	expect((await amOf(first)).am).not.toBeNull();
});

test("--new pupils-- a pupil with earlier years keeps the ΑΜ when this year's registration is deleted", async () => {
	const pupilId = await register("000", fakeAmka(), "Δοκιμαστικός");
	const am = (await amOf(pupilId)).am;
	const old = await useTestAPI("Pupils.enroll", {
		RequestObject: {
			pupil_id: pupilId,
			registration_year: "2019-2020",
			class_id: 0,
			class_year: "Α' Έτος",
			teacher_id: -1,
			instrument_id: 0,
			date: Date.UTC(2019, 8, 15),
			pass: true,
		},
	});
	expect(old.status).toBe(200);
	const ids = await enrollmentIdsOf(pupilId);
	// Both go: the older year shows the pupil has a history the register already lists.
	expect((await useTestAPI("Pupils.deleteEnrollments", { RequestObject: ids })).status).toBe(200);
	expect((await amOf(pupilId)).am).toBe(am);
});

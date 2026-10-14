/**
 * Automatic fees API tests (docs/FEES.md): the FeeCatalog routes and the recalculation the Pupils writes
 * trigger. Real HTTP against the dev server, like the other API suites.
 *
 * Isolation: everything happens in the NEXT school year (current + 1, which the public form still
 * accepts), on fixture pupils ("Δοκιμαστικός Μαθητής", ΑΜ 9000-9999 — `bun run dev:clean` removes them),
 * with catalogs this suite creates for that year. afterAll deletes the pupils, their enrollments and
 * subscriptions, and the catalog versions it created.
 *
 * Requires: `bun run dev` on :4321 and `tests/.env.test`. Uses 3 public registrations (rate limit 10/min).
 */
import type { FeeCatalogData } from "@lib/fees";
import { currentSchoolYearStart, schoolYearOf } from "@lib/pupils/years";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getJson, useTestAPI } from "../testHelpers.ts";

const YEAR = schoolYearOf(currentSchoolYearStart() + 1);
const SEED_YEAR = "2026-2027";

// ---------------------------------------------------------------------------
// Cleanup bookkeeping (local dev DB, best-effort)
// ---------------------------------------------------------------------------
const D1_DIR = path.resolve(import.meta.dir, "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");
function withLocalDb<T>(fn: (db: Database) => T): T | null {
	if (!existsSync(D1_DIR)) return null;
	const files = readdirSync(D1_DIR)
		.filter((name) => name.endsWith(".sqlite") && !name.startsWith("metadata"))
		.map((name) => path.join(D1_DIR, name))
		.filter((file) => statSync(file).size > 0)
		.sort((a, b) => statSync(b).size - statSync(a).size);
	if (files.length === 0) return null;
	const db = new Database(files[0]!);
	try {
		return fn(db);
	} finally {
		db.close();
	}
}
const catalogIdsBefore = new Set(withLocalDb((db) => (db.query("SELECT id FROM fee_catalogs").all() as { id: number }[]).map((r) => r.id)) ?? []);
const createdPupils: number[] = [];
const emails: string[] = [];

afterAll(() => {
	withLocalDb((db) => {
		const marks = (list: unknown[]) => list.map(() => "?").join(",");
		if (createdPupils.length) {
			db.run(`DELETE FROM pupil_enrollments WHERE pupil_id IN (${marks(createdPupils)})`, createdPupils);
			db.run(`DELETE FROM pupils WHERE id IN (${marks(createdPupils)})`, createdPupils);
		}
		if (emails.length) db.run(`DELETE FROM email_subscriptions WHERE email IN (${marks(emails)})`, emails);
		const catalogs = (db.query("SELECT id FROM fee_catalogs").all() as { id: number }[]).map((r) => r.id).filter((id) => !catalogIdsBefore.has(id));
		if (catalogs.length) db.run(`DELETE FROM fee_catalogs WHERE id IN (${marks(catalogs)})`, catalogs);
		db.run("UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments)");
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Enrollment = APIResponse["Pupils.get"]["enrollments"][number];

async function register(fields: { class_id: 0 | 1 | 2; class_year: string; teacher_id?: number; instrument_id?: number }) {
	const email = `pupils.test.fees.${R.hex(6)}@example.com`;
	emails.push(email);
	const res = await useTestAPI(
		"Pupils.post",
		{
			RequestObject: {
				am: String(R.int(9000, 9999)),
				amka: String(R.int(10000000000, 99999999999)),
				first_name: "Δοκιμαστικός",
				last_name: "Μαθητής",
				fathers_name: "Δοκιμαστικός",
				birth_date: Date.UTC(2000, 0, 1),
				road: "Δοκιμαστική",
				number: 1,
				tk: 10000,
				region: "Δοκιμή",
				telephone: "-",
				cellphone: "6900000005",
				email,
				registration_year: YEAR,
				teacher_id: -1,
				instrument_id: 0,
				date: Date.now(),
				pass: false,
				...fields,
			},
		},
		false,
	);
	const json = await getJson<APIResponse["Pupils.post"]>(res);
	createdPupils.push(json.data.pupilId);
	return json.data as { insertId: number; pupilId: number };
}

async function enroll(
	pupil_id: number,
	fields: { class_id: 0 | 1 | 2; class_year: string; teacher_id?: number; total_payment?: number; evaluation?: boolean },
) {
	const res = await useTestAPI("Pupils.enroll", {
		RequestObject: { pupil_id, registration_year: YEAR, teacher_id: -1, instrument_id: 0, date: Date.now(), pass: false, ...fields },
	});
	return (await getJson<APIResponse["Pupils.enroll"]>(res)).data.insertId as number;
}

async function yearOf(pupilId: number): Promise<Map<number, Enrollment>> {
	const res = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId } });
	const json = await getJson<APIResponse["Pupils.get"]>(res);
	return new Map((json.data.enrollments as Enrollment[]).filter((e) => e.registration_year === YEAR).map((e) => [e.id, e]));
}

async function update(row: Enrollment, changes: Record<string, unknown>) {
	const res = await useTestAPI("Pupils.updateEnrollment", {
		RequestObject: {
			id: row.id,
			pupil_id: row.pupil_id,
			registration_year: row.registration_year,
			class_id: row.class_id as 0 | 1 | 2,
			class_year: row.class_year,
			teacher_id: row.teacher_id,
			instrument_id: row.instrument_id,
			date: row.date,
			payment_amount: row.payment_amount,
			total_payment: row.total_payment,
			payment_date: row.payment_date ?? null,
			pass: row.pass,
			...changes,
		},
	});
	expect((await getJson(res)).message).toBe("Επιτυχής ενημέρωση εγγραφής");
}

async function createCatalog(data: FeeCatalogData) {
	const res = await useTestAPI("FeeCatalog.create", { RequestObject: { school_year: YEAR, data } });
	return (await getJson<APIResponse["FeeCatalog.create"]>(res)).data as APIResponse["FeeCatalog.create"];
}

// ---------------------------------------------------------------------------
describe("fees", () => {
	let seed: FeeCatalogData;
	let affiliatedTeacher = 0;
	let v1 = 0;

	test("--fees-- #1 the seed catalog is active for 2026-2027 and lists the non-affiliated teachers", async () => {
		const res = await useTestAPI("FeeCatalog.getActive", { UrlArgs: { school_year: SEED_YEAR } });
		const json = await getJson<APIResponse["FeeCatalog.getActive"]>(res);
		expect(json.data).not.toBeNull();
		seed = json.data.data;
		expect(seed.evaluation_fee).toBe(100);
		expect(seed.byzantine.default).toBe(20);
		expect(Object.values(seed.byzantine.teachers)).toEqual([50, 50]);
		expect(seed.traditional["Γ' Μέση"]).toBe(50);
		expect(seed.traditional["Α' Ανωτέρα"]).toBe(100);
		affiliatedTeacher = Number(Object.keys(seed.byzantine.teachers)[0]);
	});

	test("--fees-- #2 create a catalog version, read it back as active and in the versions", async () => {
		const empty = await getJson<APIResponse["FeeCatalog.getActive"]>(await useTestAPI("FeeCatalog.getActive", { UrlArgs: { school_year: YEAR } }));
		expect(empty.data).toBeNull();

		const created = await createCatalog(seed);
		v1 = created.id;
		expect(created.school_year).toBe(YEAR);
		expect(created.data).toEqual(seed);
		expect(typeof created.created_by).toBe("string");

		const active = await getJson<APIResponse["FeeCatalog.getActive"]>(await useTestAPI("FeeCatalog.getActive", { UrlArgs: { school_year: YEAR } }));
		expect(active.data.id).toBe(v1);
		const versions = await getJson<APIResponse["FeeCatalog.getVersions"]>(await useTestAPI("FeeCatalog.getVersions", { UrlArgs: { school_year: YEAR } }));
		expect(versions.data.map((v: { id: number }) => v.id)).toEqual([v1]);
		const years = await getJson<APIResponse["FeeCatalog.getYears"]>(await useTestAPI("FeeCatalog.getYears"));
		expect(years.data).toContain(YEAR);
		expect(years.data).toContain(SEED_YEAR);
	});

	test("--fees-- #3 create rejects an invalid catalog and an unknown teacher", async () => {
		await expect(
			useTestAPI("FeeCatalog.create", { RequestObject: { school_year: YEAR, data: { ...seed, multi_enrollment_factor: 2 } } }),
		).rejects.toThrow();
		const res = await useTestAPI("FeeCatalog.create", {
			RequestObject: { school_year: YEAR, data: { ...seed, byzantine: { default: 20, teachers: { "999999": 50 } } } },
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error).toContain("Άγνωστος καθηγητής");
	});

	let pupilA = 0;
	let byzA = 0;
	let tradA = 0;
	test("--fees-- #4 a Byzantine registration then a Traditional enrollment: the Traditional is halved", async () => {
		const reg = await register({ class_id: 0, class_year: "Α' Έτος" });
		pupilA = reg.pupilId;
		byzA = reg.insertId;
		let year = await yearOf(pupilA);
		expect(year.get(byzA)).toMatchObject({ fee_catalog_id: v1, fee_base: 20, evaluation_fee: 0, total_payment: 20, fee_manual: false, evaluation: false });

		tradA = await enroll(pupilA, { class_id: 1, class_year: "Α' Ανωτέρα" });
		year = await yearOf(pupilA);
		expect(year.get(tradA)).toMatchObject({ fee_catalog_id: v1, fee_base: 100, total_payment: 50 });
		expect(year.get(byzA)!.total_payment).toBe(20);

		// The joined listing rows carry the fee columns too.
		const joined = await getJson<APIResponse["Pupils.getEnrollmentById"]>(await useTestAPI("Pupils.getEnrollmentById", { UrlArgs: { id: tradA } }));
		expect(joined.data).toMatchObject({ evaluation: false, fee_base: 100, evaluation_fee: 0, fee_manual: false, fee_catalog_id: v1, total_payment: 50 });
	});

	let pupilB = 0;
	let tradB = 0;
	let byzB = 0;
	test("--fees-- #5 adding a Byzantine later re-orders: the earlier Traditional becomes half", async () => {
		const reg = await register({ class_id: 1, class_year: "Γ' Μέση", instrument_id: 1 });
		pupilB = reg.pupilId;
		tradB = reg.insertId;
		expect((await yearOf(pupilB)).get(tradB)!.total_payment).toBe(50);

		byzB = await enroll(pupilB, { class_id: 0, class_year: "Β' Έτος", teacher_id: affiliatedTeacher });
		const year = await yearOf(pupilB);
		expect(year.get(byzB)).toMatchObject({ fee_base: 50, total_payment: 50 });
		expect(year.get(tradB)).toMatchObject({ fee_base: 50, total_payment: 25 });
	});

	let evalRow = 0;
	test("--fees-- #6 an «Υπό Κατάταξη» registration stores evaluation=1, class_year='' and the evaluation fee", async () => {
		const reg = await register({ class_id: 1, class_year: "Υπό Κατάταξη" });
		evalRow = reg.insertId;
		const row = (await yearOf(reg.pupilId)).get(evalRow)!;
		expect(row).toMatchObject({ evaluation: true, class_year: "", fee_base: null, evaluation_fee: 100, total_payment: 100, fee_catalog_id: v1 });

		// A Byzantine evaluation enrollment of the same pupil: Byzantine goes first, so 100 + its full base.
		const byzEval = await enroll(reg.pupilId, { class_id: 0, class_year: "", evaluation: true });
		const year = await yearOf(reg.pupilId);
		expect(year.get(byzEval)).toMatchObject({ evaluation: true, fee_base: 20, evaluation_fee: 100, total_payment: 120 });
		expect(year.get(evalRow)!.total_payment).toBe(100 + 0); // Traditional, still unplaced, now second
	});

	test("--fees-- #7 placement keeps evaluation and fills the Traditional base", async () => {
		const pupil = createdPupils[createdPupils.length - 1]!;
		const row = (await yearOf(pupil)).get(evalRow)!;
		// The editor sends back the stored total: an unchanged total stays automatic.
		await update(row, { class_year: "Α' Ανωτέρα" });
		const placed = (await yearOf(pupil)).get(evalRow)!;
		expect(placed).toMatchObject({ evaluation: true, class_year: "Α' Ανωτέρα", fee_base: 100, evaluation_fee: 100, fee_manual: false });
		expect(placed.total_payment).toBe(150); // 100 × 0.5 (Byzantine is first) + 100
	});

	test("--fees-- #8 a manual price survives recalculation and «επαναφορά» restores the catalog price", async () => {
		const trad = (await yearOf(pupilA)).get(tradA)!;
		await update(trad, { total_payment: 30 });
		expect((await yearOf(pupilA)).get(tradA)).toMatchObject({ fee_manual: true, total_payment: 30 });

		// Another enrollment recalculates the year: the manual row keeps its price but still occupies its position.
		const eur = await enroll(pupilA, { class_id: 2, class_year: "Α' Μέση" });
		let year = await yearOf(pupilA);
		expect(year.get(tradA)).toMatchObject({ fee_manual: true, total_payment: 30 });
		expect(year.get(eur)!.total_payment).toBe(25);

		// The preview shows the catalog price next to the manual one.
		const preview = await getJson<APIResponse["Pupils.previewFees"]>(
			await useTestAPI("Pupils.previewFees", { RequestObject: { pupil_id: pupilA, registration_year: YEAR } }),
		);
		const previewRow = preview.data.rows.find((r: { id: number }) => r.id === tradA)!;
		expect(previewRow).toMatchObject({ fee_manual: true, total_payment: 30, catalog_total: 50, position: 1, factor: 0.5 });
		expect(preview.data.active_catalog_id).toBe(v1);

		// «Επαναφορά τιμής καταλόγου»
		await update(year.get(tradA)!, { fee_manual: false });
		year = await yearOf(pupilA);
		expect(year.get(tradA)).toMatchObject({ fee_manual: false, total_payment: 50 });
	});

	test("--fees-- #9 previewFees prices a draft without writing anything", async () => {
		const preview = await getJson<APIResponse["Pupils.previewFees"]>(
			await useTestAPI("Pupils.previewFees", {
				RequestObject: { pupil_id: pupilA, registration_year: YEAR, draft: { class_id: 1, class_year: "Γ' Μέση", teacher_id: -1, evaluation: true } },
			}),
		);
		const draft = preview.data.rows.find((r: { id: number }) => r.id === 0)!;
		expect(draft).toMatchObject({ fee_catalog_id: v1, fee_base: 50, evaluation_fee: 100, factor: 0.5, catalog_total: 125, total_payment: 125 });
		expect((await yearOf(pupilA)).size).toBe(3);
	});

	test("--fees-- #10 a catalog edit after registration does not change existing enrollments", async () => {
		const before = await yearOf(pupilA);
		const v2 = await createCatalog({
			...seed,
			byzantine: { default: 40, teachers: {} },
			traditional: Object.fromEntries(Object.keys(seed.traditional).map((k) => [k, 200])),
			european: { default: 90 },
		});
		expect(v2.id).toBeGreaterThan(v1);
		const versions = await getJson<APIResponse["FeeCatalog.getVersions"]>(await useTestAPI("FeeCatalog.getVersions", { UrlArgs: { school_year: YEAR } }));
		expect(versions.data.map((v: { id: number }) => v.id)).toEqual([v2.id, v1]);

		// A recalculation (an edit of the Traditional) keeps the pinned v1 prices.
		await update(before.get(tradA)!, { teacher_id: before.get(tradA)!.teacher_id });
		let after = await yearOf(pupilA);
		for (const [id, row] of before) {
			expect(after.get(id)).toMatchObject({ fee_catalog_id: v1, fee_base: row.fee_base, total_payment: row.total_payment });
		}

		// A new enrollment pins v2.
		const eur2 = await enroll(pupilA, { class_id: 2, class_year: "Α' Μέση" });
		after = await yearOf(pupilA);
		expect(after.get(eur2)).toMatchObject({ fee_catalog_id: v2.id, fee_base: 90, total_payment: 45 });
		for (const [id, row] of before) expect(after.get(id)!.total_payment).toBe(row.total_payment);
	});

	test("--fees-- #11 deleting an enrollment re-promotes the next one to full price", async () => {
		const res = await useTestAPI("Pupils.deleteEnrollments", { RequestObject: [byzB] });
		expect((await getJson(res)).message).toBe("Επιτυχής διαγραφή εγγραφών");
		const year = await yearOf(pupilB);
		expect(year.has(byzB)).toBe(false);
		expect(year.get(tradB)).toMatchObject({ fee_base: 50, total_payment: 50 });
	});

	test("--fees-- #12 a typed price equal to the catalog price on enroll is not manual; a different one is", async () => {
		const same = await enroll(pupilB, { class_id: 2, class_year: "Α' Μέση", total_payment: 45 });
		// v2 is active now: European 90 × 0.5
		let year = await yearOf(pupilB);
		expect(year.get(same)).toMatchObject({ fee_manual: false, total_payment: 45 });
		const other = await enroll(pupilB, { class_id: 2, class_year: "Α' Μέση", total_payment: 10 });
		year = await yearOf(pupilB);
		expect(year.get(other)).toMatchObject({ fee_manual: true, total_payment: 10 });
	});
});

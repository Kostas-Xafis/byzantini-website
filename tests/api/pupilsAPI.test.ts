/**
 * Pupils API tests — the standard harness: real HTTP against the dev server
 * (`VITE_URL` from tests/.env.test), session cookie obtained by logging in.
 *
 * Covers the whole Μαθητολόγιο surface: search, pupil read/update, enrollment
 * create/update/delete, the joined listing rows the admin table and exports
 * consume, and the two public routes.
 *
 * Requires: `bun run dev` on :4321 and `tests/.env.test`.
 *
 * Self-cleaning: the suite snapshots every enrollment id at the start and
 * deletes any it created before finishing, so repeated runs cannot leave rows
 * behind on `pupils`/`pupil_enrollments` (this used to add a 2027 enrollment to
 * a real pupil on every run).
 */
import { z_PupilEnrollments, z_Pupils } from "@lib/api/schemas";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { z } from "astro/zod";
import { rawAPI } from "../rawAPI.ts";
import { TEST_AM_RANGE, uniqueTestAm, withLocalDb } from "../localDb.ts";
import { expectBody, getJson, testEnv, useTestAPI } from "../testHelpers.ts";

// ---------------------------------------------------------------------------
// Bookkeeping: record every enrollment and pupil that exists before the run,
// delete what the run created afterwards (only the «Δοκιμαστικός Μαθητής»
// fixtures, never anything else). Best-effort: skipped if the local dev DB is
// not reachable. Leftover test pupils used to pile up in the test ΑΜ range
// between `dev:clean`s and made random test ΑΜs collide (see uniqueTestAm).
// ---------------------------------------------------------------------------
const ids = (db: Database, table: string) => (db.query(`SELECT id FROM ${table}`).all() as { id: number }[]).map((row) => row.id);
const enrollmentIdsBefore = new Set<number>(withLocalDb((db) => ids(db, "pupil_enrollments")) ?? []);
const pupilIdsBefore = new Set<number>(withLocalDb((db) => ids(db, "pupils")) ?? []);

afterAll(() => {
	withLocalDb((db) => {
		const marks = (list: number[]) => list.map(() => "?").join(",");
		const fixtures = (
			db.query("SELECT id FROM pupils WHERE am BETWEEN ? AND ? AND last_name = 'Μαθητής' AND first_name = 'Δοκιμαστικός'").all(...TEST_AM_RANGE) as {
				id: number;
			}[]
		)
			.map((row) => row.id)
			.filter((id) => !pupilIdsBefore.has(id));
		if (fixtures.length) db.run(`DELETE FROM pupil_enrollments WHERE pupil_id IN (${marks(fixtures)})`, fixtures);
		const created = ids(db, "pupil_enrollments").filter((id) => !enrollmentIdsBefore.has(id));
		if (created.length) db.run(`DELETE FROM pupil_enrollments WHERE id IN (${marks(created)})`, created);
		if (fixtures.length) db.run(`DELETE FROM pupils WHERE id IN (${marks(fixtures)})`, fixtures);
		db.run("UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments)");
	});
});

function pupilsTest() {
	let pupilId: number | null = null;
	let enrollmentId: number | null = null;
	let createdAm: number | null = null;
	const cellphone = "69" + R.int(10000000, 99999999);

	// ------------------------------------------------------------------
	// Search
	// ------------------------------------------------------------------
	test("--pupils-- #1 search returns paginated rows with history summary", async () => {
		const res = await useTestAPI("Pupils.search", { RequestObject: { query: "", page: 0, pageSize: 5 } });
		const json = await getJson<APIResponse["Pupils.search"]>(res);
		expect(json.data.rows.length).toBeLessThanOrEqual(5);
		expect(json.data.page).toBe(0);
		expect(json.data.pageSize).toBe(5);
		expect(json.data.total).toBeGreaterThan(0);
		for (const row of json.data.rows) {
			expect(typeof row.id).toBe("number");
			expect(row.enrollment_count).toBeGreaterThan(0);
		}
	});

	test("--pupils-- #2 search is accent-insensitive for Greek names", async () => {
		const res = await useTestAPI("Pupils.search", { RequestObject: { query: "παπαδ", pageSize: 10 } });
		const json = await getJson<APIResponse["Pupils.search"]>(res);
		expect(json.data.total).toBeGreaterThan(0);
	});

	test("--pupils-- #3 search finds a pupil by ΑΜ", async () => {
		const res = await useTestAPI("Pupils.search", { RequestObject: { query: "706" } });
		const json = await getJson<APIResponse["Pupils.search"]>(res);
		const found = json.data.rows.find((row) => row.am === 706);
		expect(found).toBeDefined();
		pupilId = found!.id;
	});

	test("--pupils-- #4 search paginates without repeating rows", async () => {
		const [first, second] = await Promise.all([
			useTestAPI("Pupils.search", { RequestObject: { query: "", page: 0, pageSize: 3 } }),
			useTestAPI("Pupils.search", { RequestObject: { query: "", page: 1, pageSize: 3 } }),
		]);
		const a = await getJson<APIResponse["Pupils.search"]>(first);
		const b = await getJson<APIResponse["Pupils.search"]>(second);
		expect(a.data.rows.length).toBe(3);
		expect(b.data.rows.length).toBe(3);
		expect(a.data.rows[0]!.id).not.toBe(b.data.rows[0]!.id);
	});

	test("--pupils-- #5 search filters by music type", async () => {
		const res = await useTestAPI("Pupils.search", { RequestObject: { query: "", class_id: 0, pageSize: 200 } });
		const json = await getJson<APIResponse["Pupils.search"]>(res);
		expect(json.data.total).toBeGreaterThan(0);
		for (const row of json.data.rows) expect(row.music_types.split(",")).toContain("0");
	});

	test("--pupils-- #6 search can list only the rows awaiting human review", async () => {
		const res = await useTestAPI("Pupils.search", { RequestObject: { query: "", needs_review: true, pageSize: 200 } });
		const json = await getJson<APIResponse["Pupils.search"]>(res);
		expect(json.data.total).toBeGreaterThan(0);
		for (const row of json.data.rows) expect(row.needs_review).toBe(true);
	});

	test("--pupils-- #7 search rejects an over-long query", async () => {
		const longQuery = "x".repeat(200);
		// the harness pre-validates against the route contract…
		await expect(useTestAPI("Pupils.search", { RequestObject: { query: longQuery } })).rejects.toThrow("Πολύ μεγάλο ερώτημα");

		// …and an anonymous caller is turned away (401) before its body is even validated
		// (server-side validation on its own is covered by #24 and tests/api/dispatch.test.ts)
		const res = await rawAPI("POST", "/pupils/search", { query: longQuery });
		expect(res.status).toBe(401);
	});

	// ------------------------------------------------------------------
	// Read
	// ------------------------------------------------------------------
	test("--pupils-- #8 get returns the pupil with their full history", async () => {
		expect(pupilId).not.toBeNull();
		const res = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const json = await getJson<APIResponse["Pupils.get"]>(res);
		expectBody(json, z.object({ pupil: z_Pupils, enrollments: z.array(z_PupilEnrollments) }));
		expect(json.data.pupil.am).toBe(706);
		expect(json.data.enrollments.length).toBeGreaterThan(0);
		expect(json.data.enrollments[0]!.pupil_id).toBe(pupilId!);
	});

	test("--pupils-- #9 get answers 404 for an unknown id", async () => {
		const res = await useTestAPI("Pupils.get", { UrlArgs: { id: 999999 } });
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.error).toBe("Ο μαθητής δεν βρέθηκε");
	});

	test("--pupils-- #10 years / totals report enrollment figures", async () => {
		const [yearsRes, totalRes, byYearRes] = await Promise.all([
			useTestAPI("Pupils.getYears"),
			useTestAPI("Pupils.getTotal"),
			useTestAPI("Pupils.getTotalByYear"),
		]);
		const years = await getJson<APIResponse["Pupils.getYears"]>(yearsRes);
		const total = await getJson<APIResponse["Pupils.getTotal"]>(totalRes);
		const byYear = await getJson<APIResponse["Pupils.getTotalByYear"]>(byYearRes);
		expectBody(years, z.array(z.string()));
		expectBody(total, z.object({ total: z.number() }));
		expect(years.data).toContain("2025-2026");
		expect(total.data.total).toBeGreaterThan(1000);
		expect(typeof byYear.data[2025]).toBe("number");
	});

	test("--pupils-- #11 getEnrollmentsByYear returns the joined legacy-compatible row", async () => {
		const res = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "2025" } });
		const json = await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(res);
		expect(json.data.length).toBeGreaterThan(0);
		const row = json.data[0]!;
		// the exact contract the admin table + PDF/Excel exports consume
		for (const key of [
			"id",
			"pupil_id",
			"am",
			"last_name",
			"first_name",
			"fathers_name",
			"birth_date",
			"road",
			"number",
			"tk",
			"region",
			"telephone",
			"cellphone",
			"email",
			"registration_year",
			"class_year",
			"class_id",
			"teacher_id",
			"instrument_id",
			"date",
			"payment_amount",
			"total_payment",
			"amka",
			"pass",
		] as const) {
			expect(key in row, `missing joined field ${key}`).toBe(true);
		}
		expect(typeof row.am).toBe("string");
		expect(row.registration_year).toBe("2025-2026");
	});

	test("--pupils-- #11b getEnrollmentsByYear with the all token lists every school year", async () => {
		const [all, oneYear, yearsRes] = await Promise.all([
			useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "all" } }),
			useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "2025" } }),
			useTestAPI("Pupils.getYears"),
		]);
		const allJson = await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(all);
		const oneYearJson = await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(oneYear);
		const availableYears = await getJson<APIResponse["Pupils.getYears"]>(yearsRes);
		expect(allJson.data.length).toBeGreaterThan(0);

		// The token lifts the year constraint: the rows span every school year
		// that has enrollments, so strictly more than one of them.
		const listedYears = new Set(allJson.data.map((row) => row.registration_year));
		expect(listedYears.size).toBeGreaterThan(1);
		for (const schoolYear of availableYears.data) {
			expect(listedYears.has(schoolYear), `missing school year ${schoolYear}`).toBe(true);
		}

		// ...and more rows than a single school year returns, with the same
		// joined contract as the year-scoped listing.
		expect(allJson.data.length).toBeGreaterThan(oneYearJson.data.length);
		expect(typeof allJson.data[0]!.am).toBe("string");
	});

	test("--pupils-- #12 getEnrollmentById returns a single joined row", async () => {
		const list = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "2025" } });
		const rows = await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(list);
		enrollmentId = rows.data[0]!.id;

		const res = await useTestAPI("Pupils.getEnrollmentById", { UrlArgs: { id: enrollmentId } });
		const json = await getJson<APIResponse["Pupils.getEnrollmentById"]>(res);
		expect(json.data.id).toBe(enrollmentId!);
		expect(json.data.pupil_id).toBe(rows.data[0]!.pupil_id);
	});

	// The joined row's `id` is the enrollment id; `pupil_id` must lead back to THAT row's pupil. It used
	// to carry the enrollment id too (#11/#12 only compared the listing with itself), so the admin editor
	// updated whichever pupil had the enrollment's id.
	test("--pupils-- #12b every joined row's pupil_id resolves to that row's pupil", async () => {
		const res = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "all" } });
		const rows = (await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(res)).data;
		// Only rows whose ids differ can tell the two apart.
		const sample = rows.filter((row) => row.id !== row.pupil_id).slice(0, 8);
		expect(sample.length).toBeGreaterThan(0);
		for (const row of sample) {
			const check = await useTestAPI("Pupils.get", { UrlArgs: { id: row.pupil_id } });
			const { pupil, enrollments } = (await getJson<APIResponse["Pupils.get"]>(check)).data;
			expect(pupil.id).toBe(row.pupil_id);
			expect([pupil.last_name, pupil.first_name, pupil.fathers_name]).toEqual([row.last_name, row.first_name, row.fathers_name]);
			expect(pupil.am === null ? pupil.orphan_code : String(pupil.am)).toBe(row.am);
			expect(enrollments.map((e) => e.id)).toContain(row.id);
		}

		const single = await useTestAPI("Pupils.getEnrollmentById", { UrlArgs: { id: sample[0]!.id } });
		expect((await getJson<APIResponse["Pupils.getEnrollmentById"]>(single)).data.pupil_id).toBe(sample[0]!.pupil_id);
	});

	// ------------------------------------------------------------------
	// Writes
	// ------------------------------------------------------------------
	test("--pupils-- #13 update changes pupil identity fields", async () => {
		expect(pupilId).not.toBeNull();
		const res = await useTestAPI("Pupils.update", { RequestObject: { id: pupilId!, cellphone } });
		const json = await getJson<APIResponse["Pupils.update"]>(res);
		expectBody(json, "Επιτυχής ενημέρωση μαθητή");

		const check = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const pupil = await getJson<APIResponse["Pupils.get"]>(check);
		expect(pupil.data.pupil.cellphone).toBe(cellphone);
	});

	// What the «Ενημέρωση Εγγραφής» modal sends (controls/Registrations/onModify.ts): the identity fields
	// of a listing row, keyed by the row's pupil_id, with the ΑΜ unchanged.
	test("--pupils-- #13b the registrations editor's identity save updates the row's own pupil", async () => {
		const res = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "all" } });
		const rows = (await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(res)).data;
		const row = rows.find((r) => r.pupil_id === pupilId && r.id !== r.pupil_id);
		expect(row, "no enrollment of the fixture pupil in the listing").toBeDefined();

		// The pupil that shares its id with the enrollment must not be touched.
		const bystanderRes = await useTestAPI("Pupils.get", { UrlArgs: { id: row!.id } });
		const bystanderBefore = bystanderRes.status === 200 ? (await bystanderRes.json()).data.pupil : null;

		const save = await useTestAPI("Pupils.update", {
			RequestObject: {
				id: row!.pupil_id,
				am: Number(row!.am) || null,
				last_name: row!.last_name,
				first_name: row!.first_name,
				fathers_name: row!.fathers_name,
			},
		});
		expectBody(await getJson<APIResponse["Pupils.update"]>(save), "Επιτυχής ενημέρωση μαθητή");

		const after = (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } }))).data.pupil;
		expect(String(after.am)).toBe(row!.am);
		expect(after.last_name).toBe(row!.last_name);
		if (bystanderBefore) {
			const bystanderAfter = (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: row!.id } }))).data.pupil;
			expect(bystanderAfter).toEqual(bystanderBefore);
		}
	});

	test("--pupils-- #13c update refuses an ΑΜ that belongs to another pupil (409, nothing written)", async () => {
		const res = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: "all" } });
		const rows = (await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(res)).data;
		const other = rows.find((r) => r.pupil_id !== pupilId && /^\d+$/.test(r.am));
		expect(other).toBeDefined();

		const conflict = await useTestAPI("Pupils.update", { RequestObject: { id: pupilId!, am: Number(other!.am), last_name: "Δεν-γράφεται" } });
		expect(conflict.status).toBe(409);
		const json = await conflict.json();
		expect(json.error).toContain(`Ο ΑΜ ${other!.am} ανήκει ήδη σε άλλον μαθητή`);
		expect(json.error).toContain(`id ${other!.pupil_id}`);

		const after = (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } }))).data.pupil;
		expect(after.am).toBe(706);
		expect(after.last_name).not.toBe("Δεν-γράφεται");
	});

	test("--pupils-- #13d update answers 404 for an unknown pupil instead of a silent no-op", async () => {
		const res = await useTestAPI("Pupils.update", { RequestObject: { id: 999999, last_name: "Κανείς" } });
		expect(res.status).toBe(404);
		expect((await res.json()).error).toBe("Ο μαθητής δεν βρέθηκε");
	});

	test("--pupils-- #14 enroll appends a history row", async () => {
		expect(pupilId).not.toBeNull();
		const res = await useTestAPI("Pupils.enroll", {
			RequestObject: {
				pupil_id: pupilId!,
				registration_year: "2026-2027",
				class_id: 2,
				class_year: "Α' Κατωτέρα",
				teacher_id: -1,
				instrument_id: 33,
				date: Date.now(),
				pass: false,
			},
		});
		const json = await getJson<APIResponse["Pupils.enroll"]>(res);
		expectBody(json, z.object({ insertId: z.number() }));
		enrollmentId = json.data.insertId;
	});

	test("--pupils-- #15 updateEnrollment edits the created row", async () => {
		expect(enrollmentId).not.toBeNull();
		const res = await useTestAPI("Pupils.updateEnrollment", {
			RequestObject: {
				id: enrollmentId!,
				pupil_id: pupilId!,
				registration_year: "2026-2027",
				class_id: 2,
				class_year: "Β' Κατωτέρα",
				teacher_id: -1,
				instrument_id: 33,
				date: Date.now(),
				payment_amount: 50,
				total_payment: 100,
				pass: false,
			},
		});
		const json = await getJson<APIResponse["Pupils.updateEnrollment"]>(res);
		expectBody(json, "Επιτυχής ενημέρωση εγγραφής");
	});

	test("--pupils-- #15b settleYear pays off every owing enrollment of the pupil-year", async () => {
		expect(enrollmentId).not.toBeNull();
		const paymentDate = new Date(2026, 9, 14).getTime();
		const res = await useTestAPI("Pupils.settleYear", {
			RequestObject: { pupil_id: pupilId!, registration_year: "2026-2027", payment_date: paymentDate },
		});
		const json = await getJson<APIResponse["Pupils.settleYear"]>(res);
		expectBody(json, z.object({ updated: z.array(z.number()) }));
		const check = await getJson<APIResponse["Pupils.getEnrollmentById"]>(await useTestAPI("Pupils.getEnrollmentById", { UrlArgs: { id: enrollmentId! } }));
		expect(check.data.payment_amount).toBe(check.data.total_payment);
		if (check.data.total_payment > 0) {
			expect(json.data.updated).toContain(enrollmentId!);
			expect(check.data.payment_date).toBe(paymentDate);
		}
		// Nothing left to settle: a second call changes nothing.
		const again = await getJson<APIResponse["Pupils.settleYear"]>(
			await useTestAPI("Pupils.settleYear", { RequestObject: { pupil_id: pupilId!, registration_year: "2026-2027", payment_date: paymentDate } }),
		);
		expect(again.data.updated).toEqual([]);
	});

	test("--pupils-- #15c settleYear requires a session", async () => {
		const anonymous = await rawAPI("POST", "/pupils/fees/settle", { pupil_id: 1, registration_year: "2026-2027", payment_date: 0 });
		expect(anonymous.status).toBe(401);
	});

	test("--pupils-- #16 deleteEnrollments removes the created row", async () => {
		expect(enrollmentId).not.toBeNull();
		const res = await useTestAPI("Pupils.deleteEnrollments", { RequestObject: [enrollmentId!] });
		const json = await getJson<APIResponse["Pupils.deleteEnrollments"]>(res);
		expectBody(json, "Επιτυχής διαγραφή εγγραφών");
	});

	// ------------------------------------------------------------------
	// Public routes
	// ------------------------------------------------------------------
	/**
	 * #17-#20 exercise the public form endpoint. #20 re-registers an EXISTING
	 * pupil (ΑΜ 706), which appends a real enrollment to their record; that row
	 * is removed again here so repeated runs stay idempotent (otherwise the
	 * dev grid accumulates a 2027 row every time the suite runs).
	 */
	let reRegistrationEnrollmentId: number | null = null;
	let reRegistrationPupilId: number | null = null;

	test("--pupils-- #17 public post creates a pupil + enrollment (new ΑΜ)", async () => {
		createdAm = uniqueTestAm();
		const res = await useTestAPI(
			"Pupils.post",
			{
				RequestObject: {
					am: String(createdAm),
					amka: "12345678901",
					first_name: "Δοκιμαστικός",
					last_name: "Μαθητής",
					fathers_name: "Δοκιμαστικός",
					birth_date: Date.UTC(1990, 0, 1),
					road: "Δοκιμαστική",
					number: 1,
					tk: 10000,
					region: "Δοκιμή",
					telephone: "-",
					cellphone: "6900000002",
					email: `pupils.test.${R.hex(4)}@example.com`,
					registration_year: "2026-2027",
					class_year: "Α' Έτος",
					class_id: 0,
					teacher_id: -1,
					instrument_id: 0,
					date: Date.now(),
					pass: false,
				},
			},
			false,
		);
		const json = await getJson<APIResponse["Pupils.post"]>(res);
		expectBody(json, z.object({ insertId: z.number(), pupilId: z.number() }));
		expect(json.data.pupilId).toBeGreaterThan(0);
		// this test's own pupil, removed by dev:clean
		pupilId = json.data.pupilId;
	});

	test("--pupils-- #18 public re-registration lookup resolves the permanent link", async () => {
		expect(pupilId).not.toBeNull();
		const read = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const pupil = await getJson<APIResponse["Pupils.get"]>(read);
		const url = pupil.data.pupil.registration_url;
		expect(url.length).toBeGreaterThan(0);

		const res = await useTestAPI("Pupils.getByReregistrationUrl", { UrlArgs: { url } }, false);
		const json = await getJson<APIResponse["Pupils.getByReregistrationUrl"]>(res);
		expect(json.data.pupil.id).toBe(pupilId!);
		expect(Array.isArray(json.data.enrollments)).toBe(true);
	});

	test("--pupils-- #19 public re-registration lookup 404s on an unknown link", async () => {
		const res = await useTestAPI("Pupils.getByReregistrationUrl", { UrlArgs: { url: "does-not-exist-" + R.hex(4) } }, false);
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(typeof json.error).toBe("string");
	});

	test("--pupils-- #20 re-registration keeps the same pupil and permanent link", async () => {
		expect(pupilId).not.toBeNull();
		const before = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const beforeJson = await getJson<APIResponse["Pupils.get"]>(before);
		const url = beforeJson.data.pupil.registration_url;
		const countBefore = beforeJson.data.enrollments.length;

		const res = await useTestAPI(
			"Pupils.post",
			{
				RequestObject: {
					am: String(createdAm),
					amka: "12345678901",
					first_name: "Δοκιμαστικός",
					last_name: "Μαθητής",
					fathers_name: "Δοκιμαστικός",
					birth_date: Date.UTC(1990, 0, 1),
					road: "Δοκιμαστική",
					number: 1,
					tk: 10000,
					region: "Δοκιμή",
					telephone: "-",
					cellphone: "6900000002",
					email: `pupils.test.${R.hex(4)}@example.com`,
					registration_year: "2026-2027",
					class_year: "Β' Έτος",
					class_id: 0,
					teacher_id: -1,
					instrument_id: 0,
					date: Date.now(),
					pass: false,
					registration_url: "should-be-ignored",
				},
			},
			false,
		);
		const json = await getJson<APIResponse["Pupils.post"]>(res);
		expect(json.data.pupilId).toBe(pupilId!);
		reRegistrationPupilId = json.data.pupilId;
		reRegistrationEnrollmentId = json.data.insertId;

		const after = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const afterJson = await getJson<APIResponse["Pupils.get"]>(after);
		expect(afterJson.data.pupil.registration_url).toBe(url);
		expect(afterJson.data.enrollments.length).toBe(countBefore + 1);
	});

	/**
	 * Undo the enrollment #20 appended to the real pupil, so the dev database
	 * keeps the migrated row count and repeated suite runs do not accumulate
	 * 2027 rows in the admin grid.
	 */
	test("--pupils-- #20b cleans up the re-registration enrollment", async () => {
		if (reRegistrationEnrollmentId === null) return;
		const res = await useTestAPI("Pupils.deleteEnrollments", { RequestObject: [reRegistrationEnrollmentId] });
		const json = await getJson<APIResponse["Pupils.deleteEnrollments"]>(res);
		expectBody(json, "Επιτυχής διαγραφή εγγραφών");

		const check = await useTestAPI("Pupils.get", { UrlArgs: { id: reRegistrationPupilId! } });
		const checkJson = await getJson<APIResponse["Pupils.get"]>(check);
		expect(checkJson.data.enrollments.some((row) => row.id === reRegistrationEnrollmentId!)).toBe(false);
		reRegistrationEnrollmentId = null;
	});

	test("--pupils-- #20c a known ΑΜ with the wrong ΑΜΚΑ cannot overwrite the pupil", async () => {
		expect(pupilId).not.toBeNull();
		const before = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const beforeJson = await getJson<APIResponse["Pupils.get"]>(before);

		const res = await useTestAPI(
			"Pupils.post",
			{
				RequestObject: {
					am: String(createdAm),
					amka: "99999999999",
					first_name: "Άλλος",
					last_name: "Χρήστης",
					fathers_name: "Άλλος",
					birth_date: Date.UTC(1990, 0, 1),
					road: "Άλλη",
					number: 2,
					tk: 20000,
					region: "Αλλού",
					telephone: "-",
					cellphone: "6900000009",
					email: `pupils.test.attacker.${R.hex(4)}@example.com`,
					registration_year: "2026-2027",
					class_year: "Β' Έτος",
					class_id: 0,
					teacher_id: -1,
					instrument_id: 0,
					date: Date.now(),
					pass: false,
				},
			},
			false,
		);
		expect(res.status).toBe(409);
		expectBody(await res.json(), undefined, true);

		const after = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const afterJson = await getJson<APIResponse["Pupils.get"]>(after);
		expect(afterJson.data.pupil.email).toBe(beforeJson.data.pupil.email);
		expect(afterJson.data.pupil.amka).toBe(beforeJson.data.pupil.amka);
		expect(afterJson.data.enrollments.length).toBe(beforeJson.data.enrollments.length);
	});

	test("--pupils-- #20d a record without ΑΜΚΑ (2023-24) is claimed by surname + birth date, then locked to that ΑΜΚΑ", async () => {
		const am = String(uniqueTestAm());
		const birth_date = Date.UTC(2001, 4, 12);
		const form = (overrides: Record<string, unknown>) =>
			useTestAPI(
				"Pupils.post",
				{
					RequestObject: {
						am,
						amka: "",
						// the dev:clean fixture name, so the row is removed with the others
						first_name: "Δοκιμαστικός",
						last_name: "Μαθητής",
						fathers_name: "Δοκιμαστικός",
						birth_date,
						road: "Δοκιμαστική",
						number: 1,
						tk: 10000,
						region: "Δοκιμή",
						telephone: "-",
						cellphone: "6900000003",
						email: `pupils.test.${R.hex(4)}@example.com`,
						registration_year: "2026-2027",
						class_year: "Α' Έτος",
						class_id: 0,
						teacher_id: -1,
						instrument_id: 0,
						date: Date.now(),
						pass: false,
						...overrides,
					} as any,
				},
				false,
			);

		// A pupil kept without an ΑΜΚΑ, as in 2023-24.
		const created = await getJson<APIResponse["Pupils.post"]>(await form({}));
		const legacyPupilId = created.data.pupilId;

		// Same ΑΜ but another surname: refused, nothing changes.
		const wrong = await form({ amka: "11111111111", last_name: "Ξένος" });
		expect(wrong.status).toBe(409);

		// Same surname + birth date: accepted, and the ΑΜΚΑ is stored.
		const claimed = await getJson<APIResponse["Pupils.post"]>(await form({ amka: "22222222222" }));
		expect(claimed.data.pupilId).toBe(legacyPupilId);
		const read = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: legacyPupilId } }));
		expect(read.data.pupil.amka).toBe("22222222222");

		// From now on the ΑΜΚΑ is required: surname + birth date alone no longer work.
		const after = await form({ amka: "33333333333" });
		expect(after.status).toBe(409);
	});

	test("--pupils-- #20e the public form cannot set promotion, a foreign class year or a far school year", async () => {
		const base = {
			am: String(uniqueTestAm()),
			amka: "44444444444",
			first_name: "Δοκιμαστικός",
			last_name: "Μαθητής",
			fathers_name: "Δοκιμαστικός",
			birth_date: Date.UTC(2002, 1, 2),
			road: "Δοκιμαστική",
			number: 1,
			tk: 10000,
			region: "Δοκιμή",
			telephone: "-",
			cellphone: "6900000004",
			email: `pupils.test.${R.hex(4)}@example.com`,
			registration_year: "2026-2027",
			class_year: "Α' Έτος",
			class_id: 0 as const,
			teacher_id: -1,
			instrument_id: 0,
			date: Date.UTC(2000, 0, 1),
			pass: true,
		};
		// A class year from another department, a school year far away, an over-long name.
		await expect(useTestAPI("Pupils.post", { RequestObject: { ...base, class_year: "Α' Μέση" } }, false)).rejects.toThrow(
			"Μη έγκυρο έτος φοίτησης για το τμήμα",
		);
		await expect(useTestAPI("Pupils.post", { RequestObject: { ...base, registration_year: "2019-2020" } }, false)).rejects.toThrow(
			"Μη έγκυρο σχολικό έτος",
		);
		await expect(useTestAPI("Pupils.post", { RequestObject: { ...base, last_name: "Μ".repeat(81) } }, false)).rejects.toThrow("έως 80 χαρακτήρες");

		// `pass` and `date` come from the server, not the form.
		const created = await getJson<APIResponse["Pupils.post"]>(await useTestAPI("Pupils.post", { RequestObject: base }, false));
		const read = await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id: created.data.pupilId } }));
		const enrollment = read.data.enrollments.find((row) => row.id === created.data.insertId)!;
		expect(Boolean(enrollment.pass)).toBe(false);
		expect(enrollment.date).toBeGreaterThan(Date.UTC(2020, 0, 1));
	});

	test("--pupils-- #21 authenticated routes reject anonymous callers", async () => {
		const base = testEnv.VITE_URL ?? "http://localhost:4321/";
		const res = await fetch(`${base.endsWith("/") ? base : base + "/"}api/pupils/total`);
		expect(res.status).toBe(401);
	});

	// ------------------------------------------------------------------
	// Public returning-student lookup (ΑΜ + ΑΜΚΑ)
	// ------------------------------------------------------------------
	test("--pupils-- #22 lookup by ΑΜ + ΑΜΚΑ returns the pupil and history", async () => {
		// ΑΜ 706 is the fixture pupil; its ΑΜΚΑ comes from the record itself so the
		// test does not hardcode personal data.
		const known = await useTestAPI("Pupils.get", { UrlArgs: { id: 159 } });
		const knownJson = await getJson<APIResponse["Pupils.get"]>(known);
		const am = knownJson.data.pupil.am!;
		const amka = knownJson.data.pupil.amka;

		const res = await useTestAPI("Pupils.getByAm", { RequestObject: { am, amka } }, false);
		const json = await getJson<APIResponse["Pupils.getByAm"]>(res);
		expectBody(json, z.object({ pupil: z_Pupils, enrollments: z.array(z_PupilEnrollments) }));
		expect(json.data.pupil.am).toBe(am);
		expect(json.data.pupil.amka).toBe(amka);
	});

	test("--pupils-- #23 lookup rejects an ΑΜΚΑ that does not match the ΑΜ", async () => {
		const res = await useTestAPI("Pupils.getByAm", { RequestObject: { am: 706, amka: "00000000000" } }, false);
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(typeof json.error).toBe("string");
	});

	test("--pupils-- #24 lookup rejects a malformed ΑΜΚΑ", async () => {
		await expect(useTestAPI("Pupils.getByAm", { RequestObject: { am: 706, amka: "123" } }, false)).rejects.toThrow("Ο ΑΜΚΑ αποτελείται από 11 ψηφία");

		// …and the server rejects it too, independently of the client
		const res = await rawAPI("POST", "/pupils/lookup", { am: 706, amka: "123" });
		expect(res.status).toBe(400);
		expect(JSON.stringify((await res.json()).details)).toContain("Ο ΑΜΚΑ αποτελείται από 11 ψηφία");
	});
}

pupilsTest();

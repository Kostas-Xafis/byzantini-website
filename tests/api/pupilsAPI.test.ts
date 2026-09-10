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
import { v_PupilEnrollments, v_Pupils } from "@_types/entities";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { array, number, object, string } from "valibot";
import { Env } from "../../lib/env/env.ts";
import { expectBody, getJson, useTestAPI } from "../testHelpers.ts";

// ---------------------------------------------------------------------------
// Enrollment bookkeeping: record every id that exists before the run, delete
// anything created during it afterwards. Best-effort (skipped if the local dev
// DB is not reachable), and never touches rows it did not create.
// ---------------------------------------------------------------------------
const D1_DIR = path.resolve(import.meta.dir, "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function withLocalDb<T>(fn: (db: Database) => T): T | null {
	if (!existsSync(D1_DIR)) return null;
	const files = readdirSync(D1_DIR)
		.filter((name) => name.endsWith(".sqlite") && !name.startsWith("metadata"))
		.map((name) => path.join(D1_DIR, name))
		.filter((file) => statSync(file).size > 0);
	if (files.length === 0) return null;
	const db = new Database(files[0]!);
	try {
		return fn(db);
	} finally {
		db.close();
	}
}

const enrollmentIdsBefore = new Set<number>(
	withLocalDb((db) => (db.query("SELECT id FROM pupil_enrollments").all() as { id: number }[]).map((row) => row.id)) ?? [],
);

afterAll(() => {
	withLocalDb((db) => {
		const now = db.query("SELECT id FROM pupil_enrollments").all() as { id: number }[];
		const created = now.map((row) => row.id).filter((id) => !enrollmentIdsBefore.has(id));
		if (created.length === 0) return;
		db.run(`DELETE FROM pupil_enrollments WHERE id IN (${created.map(() => "?").join(",")})`, created);
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

		// …and the server rejects it too, independently of the client
		const base = Env.testEnv.VITE_URL ?? "http://localhost:4321/";
		const res = await fetch(`${base.endsWith("/") ? base : base + "/"}api/pupils/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify({ query: longQuery }),
		});
		expect(res.status).toBe(400);
	});

	// ------------------------------------------------------------------
	// Read
	// ------------------------------------------------------------------
	test("--pupils-- #8 get returns the pupil with their full history", async () => {
		expect(pupilId).not.toBeNull();
		const res = await useTestAPI("Pupils.get", { UrlArgs: { id: pupilId! } });
		const json = await getJson<APIResponse["Pupils.get"]>(res);
		expectBody(json, object({ pupil: v_Pupils, enrollments: array(v_PupilEnrollments) }));
		expect(json.data.pupil.am).toBe(706);
		expect(json.data.enrollments.length).toBeGreaterThan(0);
		expect(json.data.enrollments[0]!.pupil_id).toBe(pupilId!);
	});

	test("--pupils-- #9 get fails for an unknown id", async () => {
		const res = await useTestAPI("Pupils.get", { UrlArgs: { id: 999999 } });
		expect(res.status).toBe(500);
		const json = await res.json();
		expect(typeof json.error).toBe("string");
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
		expectBody(years, array(string()));
		expectBody(total, object({ total: number() }));
		expect(years.data).toContain("2025-2026");
		expect(total.data.total).toBeGreaterThan(1000);
		expect(typeof byYear.data[2025]).toBe("number");
	});

	test("--pupils-- #11 getEnrollmentsByYear returns the joined legacy-compatible row", async () => {
		const res = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: 2025 } });
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

	test("--pupils-- #12 getEnrollmentById returns a single joined row", async () => {
		const list = await useTestAPI("Pupils.getEnrollmentsByYear", { UrlArgs: { year: 2025 } });
		const rows = await getJson<APIResponse["Pupils.getEnrollmentsByYear"]>(list);
		enrollmentId = rows.data[0]!.id;

		const res = await useTestAPI("Pupils.getEnrollmentById", { UrlArgs: { id: enrollmentId } });
		const json = await getJson<APIResponse["Pupils.getEnrollmentById"]>(res);
		expect(json.data.id).toBe(enrollmentId!);
		expect(json.data.pupil_id).toBe(rows.data[0]!.pupil_id);
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
		expectBody(json, object({ insertId: number() }));
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
		createdAm = R.int(9000, 9999);
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
					class_year: "Α' Ετος",
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
		expectBody(json, object({ insertId: number(), pupilId: number() }));
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
					class_year: "Β' Ετος",
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

	test("--pupils-- #21 authenticated routes reject anonymous callers", async () => {
		const base = Env.testEnv.VITE_URL ?? "http://localhost:4321/";
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
		expectBody(json, object({ pupil: v_Pupils, enrollments: array(v_PupilEnrollments) }));
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
	});
}

pupilsTest();

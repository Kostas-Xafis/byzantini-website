import type { EmailSubscriptions, JoinedEnrollments, PupilEnrollments, Pupils } from "@_types/entities";
import { z_JoinedEnrollments, z_PupilSearchResponse, z_PupilWithEnrollments, z_Registrations } from "@lib/api/schemas";
import { normalizeKey, normalizePhone, normalizeText, parseAm } from "@lib/pupils/normalize";
import { Random as R } from "@lib/random";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIServer, handlerResult, HTTP } from "./APIServer";
import { sendAutomatedEmail } from "./emailService";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Pupils — the Μαθητολόγιο domain. Replaces the `Registrations` group: the
 * legacy `registrations` table is split into `pupils` (identity) and
 * `pupil_enrollments` (history), see docs/PUPILS_MIGRATION.md.
 *
 * class_type ids: 0 = Βυζαντινή Μουσική, 1 = Παραδοσιακή Μουσική,
 * 2 = Ευρωπαϊκή Μουσική — the UI's three music-type tabs.
 *
 * The enrollment listing routes return the JOINED row (`JoinedEnrollments`),
 * which is a superset of the old `registrations` row, so the admin table, the
 * Excel/PDF exports and the PDF worker keep working unchanged.
 */

const CLASS_TYPE_BYZANTINE = 0;
const CLASS_TYPE_TRADITIONAL = 1;
const CLASS_TYPE_EUROPEAN = 2;

// "Επιτυχής εγγραφή" email variants, one static HTML template per class level
// (built from email/render/emails/SuccessfulRegistration.tsx). The email is
// broken down at the 2nd (Βυζαντινή Μουσική) and 3rd (Παραδοσιακή & Ευρωπαϊκή)
// bullet groups so each student only receives the instructions that apply to
// their department / year.
const successfulRegistrationTemplates = {
	default: "epitixis/epitixis_eggrafi.html",
	byzantineDefault: "epitixis/epitixis_eggrafi_byzantine.html",
	byzantineE: "epitixis/epitixis_eggrafi_byzantine_e.html",
	byzantineBDiploma: "epitixis/epitixis_eggrafi_b_diploma.html",
	traditionalDefault: "epitixis/epitixis_eggrafi_traditional.html",
	traditionalBAnotera: "epitixis/epitixis_eggrafi_traditional_b_anotera.html",
	traditionalBDiploma: "epitixis/epitixis_eggrafi_traditional_b_diploma.html",
} as const;

function successfulRegistrationTemplate(classId: number, classYear: string): string {
	if (classId === CLASS_TYPE_BYZANTINE) {
		if (classYear === "Ε' Ετος") return successfulRegistrationTemplates.byzantineE;
		if (classYear === "Β' Ετος Διπλώματος") return successfulRegistrationTemplates.byzantineBDiploma;
		return successfulRegistrationTemplates.byzantineDefault;
	}
	if (classId === CLASS_TYPE_TRADITIONAL || classId === CLASS_TYPE_EUROPEAN) {
		if (classYear === "Β' Ανωτέρα") return successfulRegistrationTemplates.traditionalBAnotera;
		if (classId === CLASS_TYPE_TRADITIONAL && classYear === "Β' Διπλώματος") return successfulRegistrationTemplates.traditionalBDiploma;
		return successfulRegistrationTemplates.traditionalDefault;
	}
	return successfulRegistrationTemplates.default;
}

// ---- Request schemas (group-local, as in the other route groups) ----

const z_IdArray = z.array(z.number().int().min(0, "Μη έγκυρο id"));

const z_Search = z.object({
	query: z.string("Μη έγκυρο ερώτημα αναζήτησης").max(120, "Πολύ μεγάλο ερώτημα"),
	/** Restrict to one music type (0/1/2) — the Μαθητολόγιο tabs. */
	class_id: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
	/** Only rows flagged for human review (the secretaries' worklist). */
	needs_review: z.boolean().optional(),
	page: z.number().int().min(0).optional(),
	pageSize: z.number().int().min(1).max(200).optional(),
});

/**
 * Fields the secretaries maintain on a pupil. Every field except `id` is
 * optional — the editor sends only what changed. (`z_Pupils.partial()` is not
 * used: its validators carry refinements that `.partial()` does not strip, so
 * omitted fields would still fail.)
 */
const z_PupilUpdate = z.object({
	id: z.number().int().min(1, "Μη έγκυρο id"),
	am: z.number().int().min(1, "Μη έγκυρο ΑΜ").max(9999, "Μη έγκυρο ΑΜ").nullable().optional(),
	orphan_code: z.string().optional(),
	split_from_am: z.number().int().min(1).max(9999).nullable().optional(),
	first_name: z.string("Μη έγκυρο όνομα").optional(),
	last_name: z.string("Μη έγκυρο επώνυμο").optional(),
	fathers_name: z.string("Μη έγκυρο όνομα πατέρα").optional(),
	birth_date: z.number().int("Μη έγκυρη ημερομηνία γέννησης").optional(),
	road: z.string("Μη έγκυρος δρόμος").optional(),
	number: z.number().int().min(0, "Μη έγκυρος αριθμός").optional(),
	tk: z.number().int().min(0, "Μη έγκυρος ταχυδρομικός κώδικας").optional(),
	region: z.string("Μη έγκυρη περιοχή").optional(),
	telephone: z.string("Μη έγκυρο τηλέφωνο").optional(),
	cellphone: z.string("Μη έγκυρο κινητό τηλέφωνο").optional(),
	email: z.string("Μη έγκυρο email").optional(),
	amka: z.union([z.string().length(11), z.literal("")], { message: "Μη έγκυρο ΑΜΚΑ" }).optional(),
	registration_url: z.string("Μη έγκυρο registration_url").optional(),
	needs_review: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
	review_note: z.string("Μη έγκυρη σημείωση ελέγχου").optional(),
});

/** A single history entry, as edited in the Μαθητολόγιο. */
const z_EnrollmentInput = z.object({
	pupil_id: z.number().int().min(1, "Μη έγκυρο pupil_id"),
	registration_year: z.string().min(1, "Μη έγκυρο έτος εγγραφής"),
	class_id: z.union([z.literal(0), z.literal(1), z.literal(2)], { message: "Μη έγκυρη μουσική" }),
	class_year: z.string("Μη έγκυρο έτος τάξης"),
	teacher_id: z.number().int().min(-1, "Μη έγκυρος καθηγητής"),
	instrument_id: z.number().int().min(0, "Μη έγκυρο μουσικό όργανο"),
	date: z.number().int().min(0, "Μη έγκυρη ημερομηνία"),
	payment_amount: z.number().int().min(0, "Μη έγκυρο ποσό πληρωμής").optional(),
	total_payment: z.number().int().min(0, "Μη έγκυρο συνολικό ποσό πληρωμής").optional(),
	payment_date: z.number().int().min(0).nullable().optional(),
	pass: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => v === true || v === 1),
});

const z_EnrollmentUpdate = z_EnrollmentInput.extend({ id: z.number().int().min(1, "Μη έγκυρο id") });

/** Public registration-form payload: pupil identity + one enrollment. */
const z_PupilPost = z_Registrations.omit({ id: true, payment_date: true, payment_amount: true, total_payment: true }).extend({
	registration_url: z.string("Μη έγκυρο registration_url").optional(),
});

const z_InsertResponse = z.object({ insertId: z.number().int().min(0, "Μη έγκυρο insertId") });

/**
 * Returning-student lookup used by the public registration form: the pupil is
 * identified by ΑΜ **and** ΑΜΚΑ (both must match, so a bare ΑΜ cannot be used to
 * enumerate pupils). Returns the same `{ pupil, enrollments }` shape as the
 * re-registration link so the form can prefill from either path.
 */
const z_AmLookup = z.object({
	am: z.number().int().min(1, "Μη έγκυρος αριθμός μητρώου").max(9999, "Μη έγκυρος αριθμός μητρώου"),
	amka: z.string().length(11, "Ο ΑΜΚΑ αποτελείται από 11 ψηφία"),
});

// ---- Helpers ----

type PupilRow = Pupils & { needs_review: 0 | 1 | boolean };
type EnrollmentRow = PupilEnrollments & { pass: 0 | 1 | boolean; payment_date: number | null };

/**
 * The wire shape the admin table / exports / PDF worker expect: the legacy
 * `registrations` row, now assembled from the pupil + its enrollment.
 */
function toJoined(enrollment: EnrollmentRow, pupil: PupilRow): JoinedEnrollments {
	const am = pupil.am === null || pupil.am === undefined ? normalizeText(pupil.orphan_code) : String(pupil.am);
	return {
		id: enrollment.id,
		pupil_id: pupil.id,
		am,
		orphan_code: normalizeText(pupil.orphan_code),
		split_from_am: pupil.split_from_am ?? null,
		last_name: pupil.last_name,
		first_name: pupil.first_name,
		fathers_name: pupil.fathers_name,
		birth_date: pupil.birth_date,
		road: pupil.road,
		number: pupil.number,
		tk: pupil.tk,
		region: pupil.region,
		telephone: pupil.telephone,
		cellphone: pupil.cellphone,
		email: pupil.email,
		amka: pupil.amka,
		registration_url: pupil.registration_url,
		needs_review: pupil.needs_review ? true : false,
		registration_year: enrollment.registration_year,
		class_year: enrollment.class_year,
		class_id: enrollment.class_id,
		teacher_id: enrollment.teacher_id,
		instrument_id: enrollment.instrument_id,
		date: enrollment.date,
		payment_amount: enrollment.payment_amount,
		total_payment: enrollment.total_payment,
		payment_date: enrollment.payment_date ?? undefined,
		pass: enrollment.pass ? true : false,
	};
}

const JOINED_SELECT = `SELECT e.id AS id, e.pupil_id AS pupil_id, e.registration_year AS registration_year,
	e.class_year AS class_year, e.class_id AS class_id, e.teacher_id AS teacher_id, e.instrument_id AS instrument_id,
	e.date AS date, e.payment_amount AS payment_amount, e.total_payment AS total_payment, e.payment_date AS payment_date,
	e.pass AS pass,
	p.am AS am, p.orphan_code AS orphan_code, p.split_from_am AS split_from_am, p.last_name AS last_name,
	p.first_name AS first_name, p.fathers_name AS fathers_name, p.birth_date AS birth_date, p.road AS road,
	p.number AS number, p.tk AS tk, p.region AS region, p.telephone AS telephone, p.cellphone AS cellphone,
	p.email AS email, p.amka AS amka, p.registration_url AS registration_url, p.needs_review AS needs_review
	FROM pupil_enrollments e JOIN pupils p ON p.id = e.pupil_id`;

function splitJoined(row: Record<string, unknown>): { enrollment: EnrollmentRow; pupil: PupilRow } {
	return { enrollment: row as unknown as EnrollmentRow, pupil: row as unknown as PupilRow };
}

/** Accent/case-insensitive haystack for one pupil search row. */
function searchHaystack(pupil: Pupils & { enrollment_count?: number }): string {
	return normalizeKey(
		[
			pupil.am === null ? "" : String(pupil.am),
			pupil.orphan_code,
			pupil.split_from_am ?? "",
			pupil.last_name,
			pupil.first_name,
			pupil.fathers_name,
			pupil.email,
			pupil.amka,
			pupil.region,
			pupil.telephone,
			pupil.cellphone,
		].join(" "),
	);
}

export const pupilsRoutes = {
	// ---------------------------------------------------------------------
	// Μαθητολόγιο search (server-side, accent-insensitive, paginated)
	// ---------------------------------------------------------------------
	search: new APIServer(
		{ method: "POST", path: "/pupils/search", schema: z_Search, responseSchema: z_PupilSearchResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const { query, class_id, needs_review, page = 0, pageSize = 50 } = body;

				const pupils = await executeQuery<Pupils>(`SELECT * FROM pupils ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC`);
				const summary = await executeQuery<{ pupil_id: number; enrollment_count: number; last_year: string; music_types: string }>(
					`SELECT pupil_id, COUNT(*) AS enrollment_count, MAX(registration_year) AS last_year,
					GROUP_CONCAT(DISTINCT class_id) AS music_types
				 FROM pupil_enrollments GROUP BY pupil_id`,
				);
				const byPupil = new Map(summary.map((row) => [row.pupil_id, row]));

				const q = normalizeKey(query);
				const digits = normalizePhone(query);
				let rows = pupils.map((pupil) => {
					const stats = byPupil.get(pupil.id);
					return {
						id: pupil.id,
						am: pupil.am,
						orphan_code: pupil.orphan_code,
						split_from_am: pupil.split_from_am,
						first_name: pupil.first_name,
						last_name: pupil.last_name,
						fathers_name: pupil.fathers_name,
						birth_date: pupil.birth_date,
						telephone: pupil.telephone,
						cellphone: pupil.cellphone,
						email: pupil.email,
						amka: pupil.amka,
						needs_review: pupil.needs_review ? true : false,
						enrollment_count: stats?.enrollment_count ?? 0,
						last_registration_year: stats?.last_year ?? "",
						music_types: stats?.music_types ?? "",
						// internal, stripped below
						haystack: searchHaystack(pupil),
					};
				});

				if (q) {
					rows = rows.filter((row) => {
						if (row.haystack.includes(q)) return true;
						// ΑΜΚΑ / phone are numeric: compare digits too ('69 73…' finds the pupil)
						if (digits && (normalizePhone(row.cellphone) === digits || normalizePhone(row.telephone) === digits || row.amka === digits))
							return true;
						return false;
					});
				}
				if (class_id !== undefined) {
					rows = rows.filter((row) => row.music_types.split(",").includes(String(class_id)));
				}
				if (needs_review) rows = rows.filter((row) => row.needs_review);

				const total = rows.length;
				const start = page * pageSize;
				const pageRows = rows.slice(start, start + pageSize).map(({ haystack, ...row }) => row);
				return { rows: pageRows, total, page, pageSize };
			}, "Σφάλμα κατά την αναζήτηση μαθητών"),
	),

	// ---------------------------------------------------------------------
	// One pupil + full history
	// ---------------------------------------------------------------------
	get: new APIServer({ method: "POST", path: "/pupils/[id:number]", responseSchema: z_PupilWithEnrollments }, [authenticateMiddleware], ({ params }) =>
		handlerResult(async () => {
			const id = Number(params.id);
			const [pupil] = await executeQuery<Pupils>("SELECT * FROM pupils WHERE id = ?", [id]);
			if (!pupil) throw Error("Ο μαθητής δεν βρέθηκε");
			const enrollments = await executeQuery<PupilEnrollments>(
				`SELECT * FROM pupil_enrollments WHERE pupil_id = ? ORDER BY registration_year DESC, class_id ASC, instrument_id ASC`,
				[id],
			);
			return { pupil, enrollments };
		}, "Σφάλμα κατά την ανάκτηση του μαθητή"),
	),

	// ---------------------------------------------------------------------
	// Pupil writes
	// ---------------------------------------------------------------------
	update: new APIServer({ method: "PUT", path: "/pupils", schema: z_PupilUpdate }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const { id, ...fields } = body as z.infer<typeof z_PupilUpdate>;
			const columns = Object.keys(fields);
			if (columns.length === 0) return "Δεν υπάρχουν αλλαγές";
			const values = columns.map((column) => (fields as Record<string, unknown>)[column]);
			await T.executeQuery(
				`UPDATE pupils SET ${columns.map((column) => `${column} = ?`).join(", ")}, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = ?`,
				[...values, id],
			);
			return "Επιτυχής ενημέρωση μαθητή";
		}, "Σφάλμα κατά την ενημέρωση του μαθητή"),
	),

	/**
	 * Public registration form (NO auth). Finds the pupil by ΑΜ — or creates one
	 * for a new registration — then appends the enrollment. This is the only
	 * unauthenticated write in the group, mirroring the old Registrations.post.
	 */
	post: new APIServer(
		{ method: "POST", path: "/pupils", schema: z_PupilPost, responseSchema: z.object({ insertId: z.number().int(), pupilId: z.number().int() }) },
		[],
		({ body, env }) =>
			handlerResult(async (T) => {
				const parsed = parseAm(body.am);
				const now = Date.now();
				const year = body.registration_year;

				// 1. Find or create the pupil.
				let pupil: Pupils | undefined;
				if (parsed.kind === "valid") {
					[pupil] = await T.executeQuery<Pupils>("SELECT * FROM pupils WHERE am = ?", [parsed.am]);
				} else {
					// No usable ΑΜ: reuse this person's existing orphan row (matched on
					// the normalized name) instead of creating a duplicate every year.
					const candidates = await T.executeQuery<Pupils>("SELECT * FROM pupils WHERE am IS NULL AND orphan_code <> ''");
					const nameKey = normalizeKey(`${body.last_name} ${body.first_name}`);
					pupil = candidates.find((row) => normalizeKey(`${row.last_name} ${row.first_name}`) === nameKey);
				}
				let pupilId: number;
				if (pupil) {
					pupilId = pupil.id;
					// Re-registration: refresh the contact details from this year's form.
					await T.executeQuery(
						`UPDATE pupils SET fathers_name=?, telephone=?, cellphone=?, email=?, road=?, number=?, tk=?, region=?, amka=?, updated_at=? WHERE id=?`,
						[body.fathers_name, body.telephone, body.cellphone, body.email, body.road, body.number, body.tk, body.region, body.amka, now, pupilId],
					);
				} else {
					// A registration with no usable ΑΜ creates an orphan pupil: the
					// secretaries assign the real ΑΜ later (ΑΜ stays NULL, the row is
					// flagged, and the code is the next free '<base>-Ο<n>').
					const orphan = parsed.kind !== "valid";
					const base = parsed.digits || "000";
					const existingCodes = await T.executeQuery<{ orphan_code: string }>("SELECT orphan_code FROM pupils WHERE orphan_code LIKE ?", [
						`${base}-Ο%`,
					]);
					const nextIndex = existingCodes.length + 1;
					const { insertId } = await T.executeQuery(
						`INSERT INTO pupils (am, orphan_code, first_name, last_name, fathers_name, birth_date, road, number, tk, region, telephone, cellphone, email, amka, registration_url, needs_review, review_note, created_at, updated_at) VALUES (???)`,
						{
							am: parsed.kind === "valid" ? parsed.am : null,
							orphan_code: orphan ? `${base}-Ο${nextIndex}` : "",
							first_name: body.first_name,
							last_name: body.last_name,
							fathers_name: body.fathers_name,
							birth_date: body.birth_date,
							road: body.road,
							number: body.number,
							tk: body.tk,
							region: body.region,
							telephone: body.telephone,
							cellphone: body.cellphone,
							email: body.email,
							amka: body.amka,
							registration_url: body.registration_url || R.string(32),
							needs_review: orphan ? 1 : 0,
							review_note: orphan ? "χωρίς ΑΜ — νέα εγγραφή, εκκρεμεί απονομή ΑΜ" : "",
							created_at: now,
							updated_at: now,
						},
					);
					pupilId = insertId;
				}

				// 2. Append the enrollment.
				const { insertId } = await T.executeQuery(
					`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at) VALUES (???)`,
					{
						pupil_id: pupilId,
						registration_year: year,
						class_id: body.class_id,
						class_year: body.class_year,
						teacher_id: body.teacher_id,
						instrument_id: body.instrument_id,
						date: body.date,
						payment_amount: 0,
						total_payment: 0,
						payment_date: null,
						pass: body.pass ? 1 : 0,
						source: "form",
						created_at: now,
					},
				);
				await T.executeQuery("UPDATE total_enrollments SET amount = amount + 1");

				// 3. Newsletter opt-in (unchanged behaviour).
				let subscription = await T.executeQuery<EmailSubscriptions>("SELECT * FROM email_subscriptions WHERE email=?", [body.email]);
				if (subscription.length === 0) {
					const unsubscribe_token = R.link(16);
					subscription = [{ email: body.email, unsubscribe_token, unrelated: false }];
					await T.executeQuery("INSERT INTO email_subscriptions (email, unsubscribe_token) VALUES (?, ?)", [
						subscription[0].email,
						subscription[0].unsubscribe_token,
					]);
				}
				// The confirmation email is sent in EVERY environment: the email
				// worker decides whether to really send or only render + log
				// (`decideDryRun` — a local `wrangler dev` request never sends), so
				// local dev exercises this exact path instead of skipping it.
				// Deliberately not awaited into the failure path: a mail outage must
				// not fail a registration that is already written.
				sendAutomatedEmail(env, {
					to: subscription[0].email,
					subject: "Επιτυχής εγγραφή",
					htmlTemplateName: successfulRegistrationTemplate(body.class_id, body.class_year),
					templateData: {
						token: subscription[0].unsubscribe_token,
						class_year: body.class_year,
						class_type: (body.class_id === 0 ? "Βυζαντινής" : body.class_id === 1 ? "Παραδοσιακής" : "Ευρωπαϊκής") + " Μουσικής",
						registration_year: body.registration_year,
					},
				}).catch((error) => console.error("Registration confirmation email failed:", error));

				return { insertId, pupilId };
			}, "Σφάλμα κατά την προσθήκη της εγγραφής"),
	),

	// ---------------------------------------------------------------------
	// Enrollment history
	// ---------------------------------------------------------------------
	enroll: new APIServer(
		{ method: "POST", path: "/pupils/enroll", schema: z_EnrollmentInput, responseSchema: z_InsertResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const { insertId } = await T.executeQuery(
					`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at) VALUES (???)`,
					{
						pupil_id: body.pupil_id,
						registration_year: body.registration_year,
						class_id: body.class_id,
						class_year: body.class_year,
						teacher_id: body.teacher_id,
						instrument_id: body.instrument_id,
						date: body.date,
						payment_amount: body.payment_amount ?? 0,
						total_payment: body.total_payment ?? 0,
						payment_date: body.payment_date ?? null,
						pass: body.pass ? 1 : 0,
						source: "admin",
						created_at: Date.now(),
					},
				);
				await T.executeQuery("UPDATE total_enrollments SET amount = amount + 1");
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη της εγγραφής"),
	),

	updateEnrollment: new APIServer({ method: "PUT", path: "/pupils/enrollments", schema: z_EnrollmentUpdate }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			await T.executeQuery(
				`UPDATE pupil_enrollments SET registration_year=?, class_id=?, class_year=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, total_payment=?, payment_date=?, pass=? WHERE id=?`,
				[
					body.registration_year,
					body.class_id,
					body.class_year,
					body.teacher_id,
					body.instrument_id,
					body.date,
					body.payment_amount ?? 0,
					body.total_payment ?? 0,
					body.payment_date ?? null,
					body.pass ? 1 : 0,
					body.id,
				],
			);
			return "Επιτυχής ενημέρωση εγγραφής";
		}, "Σφάλμα κατά την ενημέρωση της εγγραφής"),
	),

	deleteEnrollments: new APIServer({ method: "DELETE", path: "/pupils/enrollments", schema: z_IdArray }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const ids = body as number[];
			if (ids.length === 1) await T.executeQuery(`DELETE FROM pupil_enrollments WHERE id = ?`, ids);
			else await T.executeQuery(`DELETE FROM pupil_enrollments WHERE id IN (${questionMarks(ids)})`, ids);
			await T.executeQuery("UPDATE total_enrollments SET amount = amount - ?", [ids.length]);
			return "Επιτυχής διαγραφή εγγραφών";
		}, "Σφάλμα κατά την διαγραφή των εγγραφών"),
	),

	// ---------------------------------------------------------------------
	// Reads used by the existing admin table / exports / dashboard
	// ---------------------------------------------------------------------
	getEnrollmentsByYear: new APIServer(
		{ method: "GET", path: "/pupils/enrollments/[year:number]", responseSchema: z.array(z_JoinedEnrollments) },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(async () => {
				const year = `${params.year}-${Number(params.year) + 1}`;
				const rows = await executeQuery<Record<string, unknown>>(
					`${JOINED_SELECT} WHERE e.registration_year = ? ORDER BY p.last_name ASC, p.first_name ASC`,
					[year],
				);
				return rows.map((row) => {
					const { enrollment, pupil } = splitJoined(row);
					return toJoined(enrollment, pupil);
				});
			}, "Σφάλμα κατά την ανάκτηση των εγγραφών"),
	),

	getEnrollmentById: new APIServer(
		{ method: "POST", path: "/pupils/enrollments/[id:number]", responseSchema: z_JoinedEnrollments },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(async () => {
				const id = Number(params.id);
				const [row] = await executeQuery<Record<string, unknown>>(`${JOINED_SELECT} WHERE e.id = ?`, [id]);
				if (!row) throw Error("Η εγγραφή δεν βρέθηκε");
				const { enrollment, pupil } = splitJoined(row);
				return toJoined(enrollment, pupil);
			}, "Σφάλμα κατά την ανάκτηση της εγγραφής"),
	),

	getYears: new APIServer({ method: "GET", path: "/pupils/years", responseSchema: z.array(z.string()) }, [authenticateMiddleware], () =>
		handlerResult(async () => {
			const result = await executeQuery<{ registration_year: string }>(
				"SELECT DISTINCT registration_year FROM pupil_enrollments ORDER BY registration_year DESC",
			);
			return result.map((row) => row.registration_year);
		}, "Σφάλμα κατά την ανάκτηση των διαθέσιμων σχολικών ετών"),
	),

	getTotalByYear: new APIServer(
		{ method: "GET", path: "/pupils/totalByYear", responseSchema: z.record(z.number(), z.number()) },
		[authenticateMiddleware],
		() =>
			handlerResult(async () => {
				const firstYear = 2023;
				const currentYear = new Date().getFullYear();
				const result = await executeQuery<{ registration_year: string; total: number }>(
					"SELECT registration_year, COUNT(*) AS total FROM pupil_enrollments GROUP BY registration_year ORDER BY registration_year",
				);
				const returnObj = {} as Record<number, number>;
				for (let year = firstYear; year <= currentYear; year++) {
					returnObj[year] = result.find((row) => row.registration_year.startsWith(String(year)))?.total ?? 0;
				}
				return returnObj;
			}, "Σφάλμα κατά την ανάκτηση των συνόλων ανά έτος"),
	),

	getTotal: new APIServer({ method: "GET", path: "/pupils/total", responseSchema: z.object({ total: z.number() }) }, [authenticateMiddleware], () =>
		handlerResult(async () => {
			const [row] = await executeQuery<{ total: number }>("SELECT amount AS total FROM total_enrollments");
			return row ?? { total: 0 };
		}),
	),

	/**
	 * Returning-student lookup for the public form (NO auth): ΑΜ + ΑΜΚΑ must
	 * both match. 404 when the pair is unknown so the form can tell the user to
	 * register as a new student instead.
	 */
	getByAm: new APIServer({ method: "POST", path: "/pupils/lookup", schema: z_AmLookup, responseSchema: z_PupilWithEnrollments }, [], async ({ body }) => {
		const [pupil] = await executeQuery<Pupils>("SELECT * FROM pupils WHERE am = ? AND amka = ?", [body.am, body.amka]);
		if (!pupil) return APIServer.jsonError("Δεν βρέθηκε μαθητής με αυτόν τον αριθμό μητρώου και ΑΜΚΑ", HTTP.NOT_FOUND);
		const enrollments = await executeQuery<PupilEnrollments>(
			`SELECT * FROM pupil_enrollments WHERE pupil_id = ? ORDER BY registration_year DESC, class_id ASC, instrument_id ASC`,
			[pupil.id],
		);
		return APIServer.jsonData({ pupil, enrollments });
	}),

	/** Re-registration deep link: the pupil behind a permanent `registration_url`. */
	getByReregistrationUrl: new APIServer(
		{ method: "GET", path: "/pupils/reregistration/[url:string]", responseSchema: z_PupilWithEnrollments },
		[],
		async ({ params }) => {
			const [pupil] = await executeQuery<Pupils>("SELECT * FROM pupils WHERE registration_url = ?", [params.url]);
			if (!pupil) return APIServer.jsonError("Ο μαθητής δεν βρέθηκε", HTTP.NOT_FOUND);
			const enrollments = await executeQuery<PupilEnrollments>(
				`SELECT * FROM pupil_enrollments WHERE pupil_id = ? ORDER BY registration_year DESC, class_id ASC`,
				[pupil.id],
			);
			return APIServer.jsonData({ pupil, enrollments });
		},
	),
};

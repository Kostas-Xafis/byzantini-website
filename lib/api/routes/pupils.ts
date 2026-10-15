import type { EmailSubscriptions, JoinedEnrollments, PupilEnrollments, Pupils } from "@_types/entities";
import { z_IdArray, z_JoinedEnrollments, z_PupilRegistrationForm, z_PupilSearchResponse, z_PupilWithEnrollments } from "@lib/api/schemas";
import { normalizeKey, normalizePhone, normalizeText, parseAm } from "@lib/pupils/normalize";
import { classYearsByMusicType, isEvaluationClassYear, MusicTypeArr } from "@lib/classYears";
import { computeYearFees, orderForFees } from "@lib/fees";
import {
	getActiveCatalog,
	loadCatalogs,
	loadPupilYear,
	pupilYearsOf,
	recalculatePupilYears,
	type FeeEnrollmentRow,
	type PupilYear,
} from "@lib/fees/recalculate.server";
import { ALL_YEARS, currentSchoolYearStart, schoolYearOf } from "@lib/pupils/years";
import { Random as R } from "@lib/random";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult, HTTP } from "./APIServer";
import { sendAutomatedEmail } from "./emailService";
import { authenticateMiddleware } from "./middleware/authenticate";
import { rateLimitMiddleware } from "./middleware/rateLimit";

/**
 * Pupils — the Μαθητολόγιο domain. Replaces the `Registrations` group: the
 * legacy `registrations` table is split into `pupils` (identity) and
 * `pupil_enrollments` (history), see AGENTS.md, "Pupil register".
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
	byzantineBDiploma: "epitixis/epitixis_eggrafi_byzantine_b_diploma.html",
	traditionalDefault: "epitixis/epitixis_eggrafi_traditional.html",
	traditionalBAnotera: "epitixis/epitixis_eggrafi_traditional_b_anotera.html",
	traditionalBDiploma: "epitixis/epitixis_eggrafi_traditional_b_diploma.html",
} as const;

function successfulRegistrationTemplate(classId: number, classYear: string): string {
	if (classId === CLASS_TYPE_BYZANTINE) {
		if (classYear === "Ε' Έτος") return successfulRegistrationTemplates.byzantineE;
		if (classYear === "Β' Έτος Διπλώματος") return successfulRegistrationTemplates.byzantineBDiploma;
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
	/**
	 * «Υπό Κατάταξη» (docs/FEES.md §1). Omitted: kept as stored on update, 0 on enroll. A `class_year` of
	 * «Υπό Κατάταξη» (older clients) is read as `evaluation: true, class_year: ''`.
	 */
	evaluation: z
		.union([z.boolean(), z.literal(0), z.literal(1)])
		.transform((v) => v === true || v === 1)
		.optional(),
	/**
	 * «Ειδική τιμή»: `true` keeps `total_payment` as sent, `false` restores the catalog price («Επαναφορά τιμής
	 * καταλόγου»). Omitted: a `total_payment` that differs from the computed price (and, on update, from the
	 * stored one) becomes a manual price. Only meaningful on enrollments with a pinned catalog.
	 */
	fee_manual: z.boolean("Μη έγκυρη ειδική τιμή").optional(),
});

const z_EnrollmentUpdate = z_EnrollmentInput.extend({ id: z.number().int().min(1, "Μη έγκυρο id") });

/** Public registration-form payload: pupil identity + one enrollment. */
const tooLong = (max: number) => `Πολύ μεγάλο κείμενο (έως ${max} χαρακτήρες)`;
const requiredText = (message: string, max: number) => z.string(message).trim().min(1, message).max(max, tooLong(max));
/**
 * "2026-2027": two consecutive years, the start year within one of the current school year
 * (`currentSchoolYearStart`, which the form also submits — it rolls over on 1 July). The ±1 tolerance keeps a
 * form opened just before the rollover (or a skewed client clock) valid. Accepted on every date: registrations
 * outside the official window (`REGISTRATION_WINDOW`) are still taken and reviewed by the secretariat.
 */
const z_PublicSchoolYear = z
	.string("Μη έγκυρο σχολικό έτος")
	.regex(/^\d{4}-\d{4}$/, "Μη έγκυρο σχολικό έτος")
	.refine((value) => {
		const [start, end] = value.split("-").map(Number);
		return end === start + 1 && Math.abs(start - currentSchoolYearStart()) <= 1;
	}, "Μη έγκυρο σχολικό έτος");
const z_PupilPost = z_PupilRegistrationForm
	.extend({
		// Ignored by the handler (the server issues the link) — kept so older clients still validate.
		registration_url: z.string("Μη έγκυρο registration_url").optional(),
		// The form's required fields must not arrive empty, and nothing may exceed its column.
		am: z.string("Μη έγκυρο ΑΜ").trim().max(10, tooLong(10)),
		last_name: requiredText("Συμπληρώστε το επώνυμο", 80),
		first_name: requiredText("Συμπληρώστε το όνομα", 80),
		fathers_name: requiredText("Συμπληρώστε το πατρώνυμο", 80),
		telephone: z.string("Μη έγκυρο τηλέφωνο").trim().max(20, tooLong(20)),
		cellphone: requiredText("Συμπληρώστε το κινητό τηλέφωνο", 20),
		email: z.email("Μη έγκυρο email").max(80, tooLong(80)),
		road: requiredText("Συμπληρώστε την οδό", 80),
		region: requiredText("Συμπληρώστε την περιοχή", 80),
		class_id: z.union([z.literal(0), z.literal(1), z.literal(2)], { message: "Μη έγκυρο τμήμα" }),
		class_year: requiredText("Επιλέξτε έτος φοίτησης", 40),
		registration_year: z_PublicSchoolYear,
	})
	// Only the class years the form offers for that department.
	.superRefine((value, ctx) => {
		if (!classYearsByMusicType[MusicTypeArr[value.class_id]].includes(value.class_year)) {
			ctx.addIssue({ code: "custom", path: ["class_year"], message: "Μη έγκυρο έτος φοίτησης για το τμήμα" });
		}
	});

const z_InsertResponse = z.object({ insertId: z.number().int().min(0, "Μη έγκυρο insertId") });

/** Fee preview of a pupil-year, optionally with one enrollment as it is being edited (or added). */
const z_FeePreview = z.object({
	pupil_id: z.number().int().min(1, "Μη έγκυρο pupil_id"),
	registration_year: z.string().min(1, "Μη έγκυρο έτος εγγραφής"),
	draft: z
		.object({
			/** The enrollment being edited; omitted for a new one. */
			id: z.number().int().min(1, "Μη έγκυρο id").optional(),
			class_id: z.union([z.literal(0), z.literal(1), z.literal(2)], { message: "Μη έγκυρη μουσική" }),
			class_year: z.string("Μη έγκυρο έτος τάξης"),
			teacher_id: z.number().int().min(-1, "Μη έγκυρος καθηγητής"),
			evaluation: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => v === true || v === 1),
		})
		.optional(),
});

const z_FeePreviewRow = z.object({
	/** Enrollment id; 0 for a new (not yet saved) draft. */
	id: z.number().int().min(0),
	class_id: z.number().int(),
	class_year: z.string(),
	evaluation: z.boolean(),
	fee_catalog_id: z.number().int().nullable(),
	fee_manual: z.boolean(),
	/** 0-based position in the discount order (Byz → Trad → Eur, then id). */
	position: z.number().int().min(0),
	/** 1 for the first enrollment, else the pinned catalog's multi_enrollment_factor (null when unpinned). */
	factor: z.number().nullable(),
	fee_base: z.number().int().nullable(),
	evaluation_fee: z.number().int(),
	/** The catalog price (round(fee_base × factor) + evaluation_fee); null when no catalog is pinned. */
	catalog_total: z.number().int().nullable(),
	/** What the row owes: the manual / stored total when manual or unpinned, else `catalog_total`. */
	total_payment: z.number().int(),
});
/** «Εξόφληση όλων» of a pupil-year. */
const z_SettleYear = z.object({
	pupil_id: z.number().int().min(1, "Μη έγκυρο pupil_id"),
	registration_year: z.string().regex(/^\d{4}-\d{4}$/, "Μη έγκυρο σχολικό έτος"),
	payment_date: z.number().int().min(0, "Μη έγκυρη ημερομηνία πληρωμής"),
});
const z_SettleYearResponse = z.object({ updated: z.array(z.number().int()) });
const z_DashboardSummary = z.object({
	school_year: z.string(),
	needs_review: z.number().int(),
	owing: z.object({ enrollments: z.number().int(), pupils: z.number().int(), amount: z.number() }),
	new_online: z.number().int(),
});
const z_FeePreviewResponse = z.object({
	/** The active catalog of the school year (what a new enrollment would pin), or null. */
	active_catalog_id: z.number().int().nullable(),
	rows: z.array(z_FeePreviewRow),
});

/** Maps the public form's / older clients' «Υπό Κατάταξη» class year onto the evaluation status. */
function evaluationOf(classYear: string, evaluation: boolean | undefined, fallback: boolean): { evaluation: boolean; class_year: string } {
	if (isEvaluationClassYear(classYear)) return { evaluation: true, class_year: "" };
	return { evaluation: evaluation ?? fallback, class_year: classYear };
}

/** Stand-in id of a not-yet-saved enrollment in a fee preview: sorts after every real one. */
const DRAFT_ID = Number.MAX_SAFE_INTEGER;

type EnrollmentDraft = { id: number } & Partial<Pick<FeeEnrollmentRow, "class_id" | "class_year" | "teacher_id">> & { evaluation?: boolean };

/**
 * The catalog price enrollment `draft.id` would get in `pair`'s year with the `draft` fields applied (an
 * enrollment moving in from another school year included); undefined when it has no usable pinned catalog.
 */
async function computedTotal(pair: PupilYear, draft: EnrollmentDraft): Promise<number | undefined> {
	let rows = await loadPupilYear(pair);
	let target = rows.find((row) => row.id === draft.id);
	if (!target) {
		[target] = await executeQuery<FeeEnrollmentRow>(
			"SELECT id, pupil_id, registration_year, class_id, class_year, teacher_id, evaluation, fee_catalog_id, fee_manual, fee_base, evaluation_fee, total_payment FROM pupil_enrollments WHERE id = ?",
			[draft.id],
		);
		if (!target) return undefined;
	}
	const { id, evaluation, ...fields } = draft;
	const edited = { ...target, ...fields, ...(evaluation === undefined ? {} : { evaluation: evaluation ? 1 : 0 }), fee_manual: 0 };
	rows = [...rows.filter((row) => row.id !== id), edited];
	const catalogs = await loadCatalogs(rows.map((row) => row.fee_catalog_id));
	return computeYearFees(rows, catalogs).find((fee) => fee.id === id)?.total_payment;
}

/**
 * Recalculates after a write that already happened: a failure is logged, not thrown, so a retried request
 * cannot duplicate the enrollment (the next write of that pupil-year recalculates again).
 */
async function recalculateAfterInsert(pairs: PupilYear[]) {
	try {
		await recalculatePupilYears(pairs);
	} catch (error) {
		console.error("[fees] recalculation failed:", error);
	}
}

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

type PupilProof = Pick<Pupils, "amka" | "last_name" | "birth_date">;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a public form submission may update an existing pupil: the ΑΜΚΑ must match.
 * Records kept without an ΑΜΚΑ (2023-24 did not require one) are matched on surname +
 * birth date instead; that submission stores the ΑΜΚΑ, so later ones need it too.
 * (Birth dates are compared within a day and a half to absorb timezone offsets.)
 */
function canUpdatePupil(pupil: PupilProof, body: Pick<Pupils, "amka" | "last_name" | "birth_date">): boolean {
	if (pupil.amka) return pupil.amka === body.amka;
	const sameSurname = normalizeKey(pupil.last_name) === normalizeKey(body.last_name);
	const sameBirthDate = Math.abs(Number(pupil.birth_date) - Number(body.birth_date)) < 1.5 * DAY_MS;
	return sameSurname && sameBirthDate;
}

type PupilRow = Pupils & { needs_review: 0 | 1 | boolean };
type EnrollmentRow = PupilEnrollments & { pass: 0 | 1 | boolean; evaluation: 0 | 1 | boolean; fee_manual: 0 | 1 | boolean; payment_date: number | null };

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
		evaluation: enrollment.evaluation ? true : false,
		fee_catalog_id: enrollment.fee_catalog_id ?? null,
		fee_base: enrollment.fee_base ?? null,
		evaluation_fee: enrollment.evaluation_fee ?? 0,
		fee_manual: enrollment.fee_manual ? true : false,
	};
}

const JOINED_SELECT = `SELECT e.id AS id, e.pupil_id AS pupil_id, e.registration_year AS registration_year,
	e.class_year AS class_year, e.class_id AS class_id, e.teacher_id AS teacher_id, e.instrument_id AS instrument_id,
	e.date AS date, e.payment_amount AS payment_amount, e.total_payment AS total_payment, e.payment_date AS payment_date,
	e.pass AS pass, e.evaluation AS evaluation, e.fee_catalog_id AS fee_catalog_id, e.fee_base AS fee_base,
	e.evaluation_fee AS evaluation_fee, e.fee_manual AS fee_manual,
	p.am AS am, p.orphan_code AS orphan_code, p.split_from_am AS split_from_am, p.last_name AS last_name,
	p.first_name AS first_name, p.fathers_name AS fathers_name, p.birth_date AS birth_date, p.road AS road,
	p.number AS number, p.tk AS tk, p.region AS region, p.telephone AS telephone, p.cellphone AS cellphone,
	p.email AS email, p.amka AS amka, p.registration_url AS registration_url, p.needs_review AS needs_review
	FROM pupil_enrollments e JOIN pupils p ON p.id = e.pupil_id`;

/**
 * One JOINED_SELECT row viewed as its enrollment and its pupil. The row's `id` is the ENROLLMENT id
 * (`e.id AS id`), so the pupil view takes its id from `pupil_id` — reading `pupil.id` off the raw row
 * handed the enrollment id to the admin editor, which then updated whichever pupil had that id.
 */
function splitJoined(row: Record<string, unknown>): { enrollment: EnrollmentRow; pupil: PupilRow } {
	return { enrollment: row as unknown as EnrollmentRow, pupil: { ...row, id: row.pupil_id } as unknown as PupilRow };
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
			const { id } = params;
			const [pupil] = await executeQuery<Pupils>("SELECT * FROM pupils WHERE id = ?", [id]);
			if (!pupil) throw APIError.notFound("Ο μαθητής δεν βρέθηκε");
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
			const { id, ...fields } = body;
			const [pupil] = await executeQuery<{ id: number }>("SELECT id FROM pupils WHERE id = ?", [id]);
			if (!pupil) throw APIError.notFound("Ο μαθητής δεν βρέθηκε");
			const columns = Object.keys(fields);
			if (columns.length === 0) return "Δεν υπάρχουν αλλαγές";
			// The unique indexes (am, registration_url) would otherwise surface as a raw 500.
			if (fields.am != null) {
				const [holder] = await executeQuery<Pick<Pupils, "id" | "last_name" | "first_name">>(
					"SELECT id, last_name, first_name FROM pupils WHERE am = ? AND id <> ?",
					[fields.am, id],
				);
				if (holder) {
					throw APIError.conflict(`Ο ΑΜ ${fields.am} ανήκει ήδη σε άλλον μαθητή: ${holder.last_name} ${holder.first_name} (id ${holder.id})`);
				}
			}
			if (fields.registration_url) {
				const [holder] = await executeQuery<{ id: number }>("SELECT id FROM pupils WHERE registration_url = ? AND id <> ?", [
					fields.registration_url,
					id,
				]);
				if (holder) throw APIError.conflict(`Ο σύνδεσμος εγγραφής χρησιμοποιείται ήδη από άλλον μαθητή (id ${holder.id})`);
			}
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
		[rateLimitMiddleware("registration")],
		async ({ body, env }) => {
			// This route is public: an existing pupil may only be updated by whoever proves
			// it is them (see canUpdatePupil) — a known ΑΜ with other details is refused
			// instead of overwriting that pupil's contact data.
			const parsed = parseAm(body.am);
			if (parsed.kind === "valid") {
				const [owner] = await executeQuery<PupilProof>("SELECT amka, last_name, birth_date FROM pupils WHERE am = ? LIMIT 1", [parsed.am]);
				if (owner && !canUpdatePupil(owner, body)) {
					return APIServer.jsonError(
						"Ο αριθμός μητρώου και ο ΑΜΚΑ δεν αντιστοιχούν στα στοιχεία του μαθητή. Ελέγξτε τα ή επικοινωνήστε με τη Γραμματεία της Σχολής.",
						HTTP.CONFLICT,
					);
				}
			}
			return handlerResult(async (T) => {
				const now = Date.now();
				const year = body.registration_year;
				// «Υπό Κατάταξη» is a status: the form still offers it as a class year (docs/FEES.md §1).
				const { evaluation, class_year } = evaluationOf(body.class_year, undefined, false);
				// The catalog active NOW is pinned on the enrollment (a later catalog edit never changes it).
				const catalog = await getActiveCatalog(year);

				// 1. Find or create the pupil.
				let pupil: Pupils | undefined;
				if (parsed.kind === "valid") {
					// Ownership was checked above.
					[pupil] = await T.executeQuery<Pupils>("SELECT * FROM pupils WHERE am = ?", [parsed.am]);
				} else {
					// No usable ΑΜ: reuse this person's existing orphan row instead of creating
					// a duplicate every year — never on the name alone (anyone can type a name).
					const candidates = await T.executeQuery<Pupils>("SELECT * FROM pupils WHERE am IS NULL AND orphan_code <> ''");
					const nameKey = normalizeKey(`${body.last_name} ${body.first_name}`);
					pupil = candidates.find((row) => normalizeKey(`${row.last_name} ${row.first_name}`) === nameKey && canUpdatePupil(row, body));
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
							registration_url: R.string(32),
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
					`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at, evaluation, fee_catalog_id, fee_manual) VALUES (???)`,
					{
						pupil_id: pupilId,
						registration_year: year,
						class_id: body.class_id,
						class_year,
						teacher_id: body.teacher_id,
						instrument_id: body.instrument_id,
						date: now,
						payment_amount: 0,
						total_payment: 0,
						payment_date: null,
						// Promotion is decided by the school, never by the public form.
						pass: 0,
						source: "form",
						created_at: now,
						evaluation: evaluation ? 1 : 0,
						fee_catalog_id: catalog?.id ?? null,
						fee_manual: 0,
					},
				);
				await T.executeQuery("UPDATE total_enrollments SET amount = amount + 1");
				// 2b. Fees of the pupil's whole year (a second enrollment may re-order the discount).
				await recalculateAfterInsert([{ pupil_id: pupilId, registration_year: year }]);

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
					// «Υπό Κατάταξη» falls through to the department's default template.
					htmlTemplateName: successfulRegistrationTemplate(body.class_id, body.class_year),
					templateData: {
						token: subscription[0].unsubscribe_token,
						class_year: body.class_year,
						class_type: (body.class_id === 0 ? "Βυζαντινής" : body.class_id === 1 ? "Παραδοσιακής" : "Ευρωπαϊκής") + " Μουσικής",
						registration_year: body.registration_year,
					},
				}).catch((error) => console.error("Registration confirmation email failed:", error));

				return { insertId, pupilId };
			}, "Σφάλμα κατά την προσθήκη της εγγραφής");
		},
	),

	// ---------------------------------------------------------------------
	// Enrollment history
	// ---------------------------------------------------------------------
	enroll: new APIServer(
		{ method: "POST", path: "/pupils/enroll", schema: z_EnrollmentInput, responseSchema: z_InsertResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const { evaluation, class_year } = evaluationOf(body.class_year, body.evaluation, false);
				// The active catalog of the enrollment's year is pinned now and never re-pinned (docs/FEES.md §3).
				const catalog = await getActiveCatalog(body.registration_year);
				const manualTotal =
					catalog && body.total_payment !== undefined && (body.fee_manual === true || (body.fee_manual === undefined && body.total_payment > 0));
				const { insertId } = await T.executeQuery(
					`INSERT INTO pupil_enrollments (pupil_id, registration_year, class_id, class_year, teacher_id, instrument_id, date, payment_amount, total_payment, payment_date, pass, source, created_at, evaluation, fee_catalog_id, fee_manual) VALUES (???)`,
					{
						pupil_id: body.pupil_id,
						registration_year: body.registration_year,
						class_id: body.class_id,
						class_year,
						teacher_id: body.teacher_id,
						instrument_id: body.instrument_id,
						date: body.date,
						payment_amount: body.payment_amount ?? 0,
						total_payment: body.total_payment ?? 0,
						payment_date: body.payment_date ?? null,
						pass: body.pass ? 1 : 0,
						source: "admin",
						created_at: Date.now(),
						evaluation: evaluation ? 1 : 0,
						fee_catalog_id: catalog?.id ?? null,
						// Provisionally manual when a price was typed; settled against the computed price below.
						fee_manual: manualTotal ? 1 : 0,
					},
				);
				await T.executeQuery("UPDATE total_enrollments SET amount = amount + 1");
				const pair = { pupil_id: body.pupil_id, registration_year: body.registration_year };
				// A typed price equal to the catalog price is not a manual price.
				if (manualTotal && body.fee_manual === undefined) {
					const computed = await computedTotal(pair, { id: insertId });
					if (computed === body.total_payment) await T.executeQuery("UPDATE pupil_enrollments SET fee_manual = 0 WHERE id = ?", [insertId]);
				}
				await recalculateAfterInsert([pair]);
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη της εγγραφής"),
	),

	/**
	 * Edits an enrollment and recalculates the fees of its pupil-year (both years on a school-year move). The
	 * pinned catalog is never changed. Manual price rules (enrollments with a pinned catalog):
	 * `fee_manual: false` → catalog price; `fee_manual: true` → `total_payment` as sent; omitted → a
	 * `total_payment` different from both the stored and the computed price becomes manual (an already
	 * manual row stays manual unless the sent total equals the computed price).
	 */
	updateEnrollment: new APIServer({ method: "PUT", path: "/pupils/enrollments", schema: z_EnrollmentUpdate }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const [existing] = await executeQuery<FeeEnrollmentRow>(
				"SELECT id, pupil_id, registration_year, evaluation, fee_catalog_id, fee_manual, total_payment FROM pupil_enrollments WHERE id = ?",
				[body.id],
			);
			if (!existing) throw APIError.notFound("Η εγγραφή δεν βρέθηκε");
			const { evaluation, class_year } = evaluationOf(body.class_year, body.evaluation, !!existing.evaluation);

			let manual = false;
			let total = body.total_payment ?? 0;
			if (existing.fee_catalog_id != null) {
				total = body.total_payment ?? existing.total_payment;
				if (body.fee_manual !== undefined) manual = body.fee_manual;
				else if (body.total_payment === undefined) manual = !!existing.fee_manual;
				else {
					const computed = await computedTotal(
						{ pupil_id: existing.pupil_id, registration_year: body.registration_year },
						{ id: body.id, class_id: body.class_id, class_year, teacher_id: body.teacher_id, evaluation },
					);
					manual = existing.fee_manual
						? body.total_payment !== computed
						: body.total_payment !== existing.total_payment && body.total_payment !== computed;
				}
			}

			await T.executeQuery(
				`UPDATE pupil_enrollments SET registration_year=?, class_id=?, class_year=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, total_payment=?, payment_date=?, pass=?, evaluation=?, fee_manual=? WHERE id=?`,
				[
					body.registration_year,
					body.class_id,
					class_year,
					body.teacher_id,
					body.instrument_id,
					body.date,
					body.payment_amount ?? 0,
					total,
					body.payment_date ?? null,
					body.pass ? 1 : 0,
					evaluation ? 1 : 0,
					manual ? 1 : 0,
					body.id,
				],
			);
			await recalculatePupilYears([
				{ pupil_id: existing.pupil_id, registration_year: existing.registration_year },
				{ pupil_id: existing.pupil_id, registration_year: body.registration_year },
			]);
			return "Επιτυχής ενημέρωση εγγραφής";
		}, "Σφάλμα κατά την ενημέρωση της εγγραφής"),
	),

	deleteEnrollments: new APIServer({ method: "DELETE", path: "/pupils/enrollments", schema: z_IdArray }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const ids = body;
			// The pupil-years whose discount order changes once these rows are gone.
			const affected = await pupilYearsOf(ids);
			if (ids.length === 1) await T.executeQuery(`DELETE FROM pupil_enrollments WHERE id = ?`, ids);
			else await T.executeQuery(`DELETE FROM pupil_enrollments WHERE id IN (${questionMarks(ids)})`, ids);
			await T.executeQuery("UPDATE total_enrollments SET amount = amount - ?", [ids.length]);
			await recalculatePupilYears(affected);
			return "Επιτυχής διαγραφή εγγραφών";
		}, "Σφάλμα κατά τη διαγραφή των εγγραφών"),
	),

	/**
	 * Fee breakdown of a pupil-year, as stored or — with `draft` — as it would be after saving that enrollment
	 * (an edit when `draft.id` is set, otherwise a new enrollment pinning the year's active catalog). Read-only.
	 */
	previewFees: new APIServer(
		{ method: "POST", path: "/pupils/fees/preview", schema: z_FeePreview, responseSchema: z_FeePreviewResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const pair = { pupil_id: body.pupil_id, registration_year: body.registration_year };
				const active = await getActiveCatalog(body.registration_year);
				let rows = await loadPupilYear(pair);
				if (body.draft) {
					const { id, ...fields } = body.draft;
					const { evaluation, class_year } = evaluationOf(fields.class_year, fields.evaluation, false);
					const draftFields = { ...fields, class_year, evaluation: evaluation ? 1 : 0 };
					if (id !== undefined) {
						// The edited row — possibly moving in from another school year (it keeps its pinned catalog).
						const [stored] = rows.some((row) => row.id === id)
							? rows.filter((row) => row.id === id)
							: await executeQuery<FeeEnrollmentRow>(
									"SELECT id, pupil_id, registration_year, class_id, class_year, teacher_id, evaluation, fee_catalog_id, fee_manual, fee_base, evaluation_fee, total_payment FROM pupil_enrollments WHERE id = ? AND pupil_id = ?",
									[id, body.pupil_id],
								);
						if (!stored) throw APIError.notFound("Η εγγραφή δεν βρέθηκε");
						rows = [...rows.filter((row) => row.id !== id), { ...stored, ...draftFields }];
					} else {
						rows = [
							...rows,
							{
								...pair,
								...draftFields,
								id: DRAFT_ID,
								fee_catalog_id: active?.id ?? null,
								fee_manual: 0,
								fee_base: null,
								evaluation_fee: 0,
								total_payment: 0,
							},
						];
					}
				}
				const catalogs = await loadCatalogs(rows.map((row) => row.fee_catalog_id));
				// Every pinned row priced from its catalog, manual ones included (what «Επαναφορά» would give).
				const priced = new Map(
					computeYearFees(
						rows.map((row) => ({ ...row, fee_manual: 0 })),
						catalogs,
					).map((fee) => [fee.id, fee]),
				);
				return {
					active_catalog_id: active?.id ?? null,
					rows: orderForFees(rows).map((row, position) => {
						const fee = priced.get(row.id);
						const manual = !!row.fee_manual;
						return {
							id: row.id === DRAFT_ID ? 0 : row.id,
							class_id: row.class_id,
							class_year: row.class_year,
							evaluation: !!row.evaluation,
							fee_catalog_id: row.fee_catalog_id ?? null,
							fee_manual: manual,
							position,
							factor: fee?.factor ?? null,
							fee_base: fee ? fee.fee_base : (row.fee_base ?? null),
							evaluation_fee: fee ? fee.evaluation_fee : row.evaluation_fee,
							catalog_total: fee?.total_payment ?? null,
							total_payment: fee && !manual ? fee.total_payment : row.total_payment,
						};
					}),
				};
			}, "Σφάλμα κατά τον υπολογισμό των διδάκτρων"),
	),

	/**
	 * «Εξόφληση όλων»: every enrollment of a pupil-year with a balance gets `payment_amount = total_payment` and
	 * the given payment date — one UPDATE statement, so it applies to all of them or none. Fees are untouched.
	 */
	settleYear: new APIServer(
		{ method: "POST", path: "/pupils/fees/settle", schema: z_SettleYear, responseSchema: z_SettleYearResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const owing = await executeQuery<{ id: number }>(
					"SELECT id FROM pupil_enrollments WHERE pupil_id = ? AND registration_year = ? AND total_payment > payment_amount",
					[body.pupil_id, body.registration_year],
				);
				if (owing.length === 0) return { updated: [] };
				const ids = owing.map((row) => row.id);
				await executeQuery(`UPDATE pupil_enrollments SET payment_amount = total_payment, payment_date = ? WHERE id IN (${questionMarks(ids)})`, [
					body.payment_date,
					...ids,
				]);
				return { updated: ids };
			}, "Σφάλμα κατά την εξόφληση των εγγραφών"),
	),

	// ---------------------------------------------------------------------
	// Reads used by the existing admin table / exports / dashboard
	// ---------------------------------------------------------------------
	/**
	 * Enrollment listing behind the admin registrations table. `year` is either
	 * the START year of a school year ("2025") or `ALL_YEARS` ("all"), which
	 * lists every enrollment without any year constraint.
	 */
	getEnrollmentsByYear: new APIServer(
		{ method: "GET", path: "/pupils/enrollments/[year:string]", responseSchema: z.array(z_JoinedEnrollments) },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(async () => {
				const orderBy = "ORDER BY p.last_name ASC, p.first_name ASC";
				const rows =
					params.year === ALL_YEARS
						? await executeQuery<Record<string, unknown>>(`${JOINED_SELECT} ${orderBy}`)
						: await executeQuery<Record<string, unknown>>(`${JOINED_SELECT} WHERE e.registration_year = ? ${orderBy}`, [schoolYearOf(params.year)]);
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
				const { id } = params;
				const [row] = await executeQuery<Record<string, unknown>>(`${JOINED_SELECT} WHERE e.id = ?`, [id]);
				if (!row) throw APIError.notFound("Η εγγραφή δεν βρέθηκε");
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
	 * «Αρχική» dashboard: what needs the secretariat's attention, in one statement.
	 * `since` (epoch ms) is the admin's previous visit — the client remembers it per device;
	 * `new_online` counts public-form enrollments after it. `owing` covers the current school
	 * year (`currentSchoolYearStart`) only.
	 */
	dashboardSummary: new APIServer(
		{ method: "GET", path: "/pupils/dashboard/[since:number]", responseSchema: z_DashboardSummary },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(async () => {
				const schoolYear = schoolYearOf(currentSchoolYearStart());
				const [row] = await executeQuery<{
					needs_review: number;
					owing_enrollments: number;
					owing_pupils: number;
					owing_amount: number | null;
					new_online: number;
				}>(
					`SELECT
						(SELECT COUNT(*) FROM pupils WHERE needs_review = 1) AS needs_review,
						COUNT(*) AS owing_enrollments,
						COUNT(DISTINCT pupil_id) AS owing_pupils,
						SUM(total_payment - payment_amount) AS owing_amount,
						(SELECT COUNT(*) FROM pupil_enrollments WHERE source = 'form' AND date > ?) AS new_online
					FROM pupil_enrollments WHERE registration_year = ? AND payment_amount < total_payment`,
					[params.since, schoolYear],
				);
				return {
					school_year: schoolYear,
					needs_review: row?.needs_review ?? 0,
					owing: { enrollments: row?.owing_enrollments ?? 0, pupils: row?.owing_pupils ?? 0, amount: row?.owing_amount ?? 0 },
					new_online: row?.new_online ?? 0,
				};
			}, "Σφάλμα κατά την ανάκτηση της σύνοψης"),
	),

	/**
	 * Returning-student lookup for the public form (NO auth): ΑΜ + ΑΜΚΑ must
	 * both match. 404 when the pair is unknown so the form can tell the user to
	 * register as a new student instead.
	 */
	getByAm: new APIServer(
		{ method: "POST", path: "/pupils/lookup", schema: z_AmLookup, responseSchema: z_PupilWithEnrollments },
		[rateLimitMiddleware("lookup")],
		async ({ body }) => {
			const [pupil] = await executeQuery<Pupils>("SELECT * FROM pupils WHERE am = ? AND amka = ?", [body.am, body.amka]);
			if (!pupil) return APIServer.jsonError("Δεν βρέθηκε μαθητής με αυτόν τον αριθμό μητρώου και ΑΜΚΑ", HTTP.NOT_FOUND);
			const enrollments = await executeQuery<PupilEnrollments>(
				`SELECT * FROM pupil_enrollments WHERE pupil_id = ? ORDER BY registration_year DESC, class_id ASC, instrument_id ASC`,
				[pupil.id],
			);
			return APIServer.jsonData({ pupil, enrollments });
		},
	),

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

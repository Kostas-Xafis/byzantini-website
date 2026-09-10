/**
 * Zod schemas — Phase 4 ports of the valibot `v_*` schemas in
 * `types/entities.ts` (kept alongside until the old route system is retired).
 *
 * Greek validation messages preserved.
 */
import { z } from "astro/zod";

export type Insert = { insertId: number };

const looseBoolean = (message = "Μη έγκυρο loose boolean") =>
	z.union([z.boolean(), z.literal(0), z.literal(1)], { message }).transform((v) => v === true || v === 1);
const positiveInt = (message = "Μη έγκυρος θετικός ακέραιος") => z.number().int().min(0, message);

export const z_Books = z.object({
	id: positiveInt("Μη έγκυρο id"),
	title: z.string().min(1, "Μη έγκυρος τίτλος βιβλίου"),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	wholesale_price: positiveInt("Μη έγκυρη τιμή χονδρικής"),
	price: positiveInt("Μη έγκυρη τιμή"),
	quantity: positiveInt("Μη έγκυρη ποσότητα"),
	sold: positiveInt("Μη έγκυρο πλήθος πωλήσεων"),
});

export const z_Payments = z.object({
	id: positiveInt("Μη έγκυρο id"),
	student_name: z.string().min(1, "Μη έγκυρο όνομα μαθητή"),
	book_id: positiveInt("Μη έγκυρο book_id"),
	amount: positiveInt("Μη έγκυρο ποσό"),
	book_amount: z.number().int().min(1, "Μη έγκυρο πλήθος βιβλίων"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_date: positiveInt("Μη έγκυρη ημερομηνία πληρωμής").optional(),
});

export const z_Payoffs = z.object({
	id: positiveInt("Μη έγκυρο id"),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	amount: positiveInt("Μη έγκυρο ποσό"),
});

export const z_Wholesalers = z.object({
	id: positiveInt("Μη έγκυρο id"),
	name: z.string().min(1, "Μη έγκυρο όνομα"),
});

export const z_SysUsers = z.object({
	id: positiveInt("Μη έγκυρο id"),
	email: z.email("Μη έγκυρο email"),
	password: z.string().min(1, "Μη έγκυρος κωδικός"),
	session_id: z.string().min(1, "Μη έγκυρο session_id"),
	session_exp_date: positiveInt("Μη έγκυρη ημερομηνία λήξης session"),
});

export const z_SysUserRegisterLink = z.object({
	link: z.string().min(1, "Μη έγκυρος σύνδεσμος"),
	exp_date: positiveInt("Μη έγκυρη ημερομηνία λήξης"),
});

export const z_LoginCredentials = z.object({
	email: z.email("Μη έγκυρο email"),
	password: z.string().min(1, "Μη έγκυρος κωδικός"),
});

export const z_Teachers = z.object({
	id: positiveInt("Μη έγκυρο id"),
	fullname: z.string().min(1, "Μη έγκυρο ονοματεπώνυμο"),
	picture: z.string("Μη έγκυρη εικόνα").nullable(),
	cv: z.string("Μη έγκυρο βιογραφικό").nullable(),
	email: z
		.union([z.email("Μη έγκυρο email"), z.literal("")])
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	telephone: z
		.string("Μη έγκυρο τηλέφωνο")
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	linktree: z
		.string("Μη έγκυρο linktree")
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	gender: z.union([z.literal("M"), z.literal("F")], { message: "Μη έγκυρο φύλο" }),
	title: z.union([z.literal(0), z.literal(1), z.literal(2)], { message: "Μη έγκυρος τίτλος δασκάλου" }), // 0: Καθηγητής, 1: Δάσκαλος, 2: Επιμελητής
	visible: looseBoolean("Μη έγκυρη ορατότητα"),
	online: looseBoolean("Μη έγκυρη σύνδεση"),
	amka: z.union([z.string().length(11), z.literal("")], { message: "Μη έγκυρο ΑΜΚΑ" }),
});

export const z_TeacherLocations = z.object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	location_id: positiveInt("Μη έγκυρο location_id"),
});

export const z_TeacherClasses = z.object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	class_id: positiveInt("Μη έγκυρο class_id"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	registration_number: z.string("Μη έγκυρος αριθμός έγκρισης").nullable().optional(), //Αριθμός Έγκρισης
});

export const z_ClassType = z.object({
	id: positiveInt("Μη έγκυρο id"),
	name: z.string().min(1, "Μη έγκυρο όνομα"),
});

export const z_Locations = z.object({
	id: positiveInt("Μη έγκυρο id"),
	name: z.string("Μη έγκυρο όνομα"),
	address: z.string("Μη έγκυρη διεύθυνση"),
	areacode: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	municipality: z.string("Μη έγκυρος δήμος"),
	email: z.email("Μη έγκυρο email").optional(),
	manager: z.string("Μη έγκυρος διαχειριστής"),
	telephones: z.string("Μη έγκυρα τηλέφωνα"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	image: z.string("Μη έγκυρη εικόνα").optional(),
	map: z.string("Μη έγκυρος σύνδεσμος Google maps"),
	link: z.string("Μη έγκυρος σύνδεσμος").optional(),
	youtube: z.string("Μη έγκυρος σύνδεσμος Youtube").optional(),
	partner: looseBoolean("Μη έγκυρος συνεργάτης"),
});

export const z_Instruments = z.object({
	id: positiveInt("Μη έγκυρο id"),
	name: z.string().min(1, "Μη έγκυρο όνομα"),
	type: z.union([z.literal("par"), z.literal("eur")], { message: "Μη έγκυρος τύπος" }),
	isInstrument: looseBoolean("Μη έγκυρο μουσικό όργανο"),
});

export const z_TeacherInstruments = z.object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	instrument_id: positiveInt("Μη έγκυρο instrument_id"),
});

export const z_Registrations = z.object({
	id: positiveInt("Μη έγκυρο id"),
	am: z.string("Μη έγκυρο ΑΜ"),
	amka: z.union([z.string().length(11), z.literal("")], { message: "Μη έγκυρο ΑΜΚΑ" }),
	first_name: z.string("Μη έγκυρο όνομα"),
	last_name: z.string("Μη έγκυρο επώνυμο"),
	fathers_name: z.string("Μη έγκυρο όνομα πατέρα"),
	birth_date: z.number().int("Μη έγκυρη ημερομηνία γέννησης"),
	telephone: z.string("Μη έγκυρο τηλέφωνο"),
	cellphone: z.string("Μη έγκυρο κινητό τηλέφωνο"),
	email: z.email("Μη έγκυρο email"),
	road: z.string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: z.string("Μη έγκυρη περιοχή"),
	registration_year: z.string("Μη έγκυρο έτος εγγραφής"),
	class_year: z.string("Μη έγκυρο έτος τάξης"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	teacher_id: z.number().int().min(-1, "Μη έγκυρος καθηγητής"),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: positiveInt("Μη έγκυρο ποσό πληρωμής").optional(),
	total_payment: positiveInt("Μη έγκυρο συνολικό ποσό πληρωμής").optional(),
	payment_date: positiveInt("Μη έγκυρη ημερομηνία πληρωμής").nullable().optional(),
	registration_url: z.string("Μη έγκυρο registration_url").optional(),
	pass: looseBoolean("Μη έγκυρο προαγωγή"),
});

export const z_EmailSubscriptions = z.object({
	email: z.email("Μη έγκυρο email"),
	unsubscribe_token: z.string("Μη έγκυρο unsubscribe_token"),
	unrelated: looseBoolean("Μη έγκυρο unrelated"),
});

// ---------------------------------------------------------------------------
// Pupil register (Μαθητολόγιο) — see docs/PUPILS_MIGRATION.md
// ---------------------------------------------------------------------------

/** ΑΜΚΑ is either a full 11-digit number or '' (not collected in early years). */
const z_Amka = z.union([z.string().length(11), z.literal("")], { message: "Μη έγκυρο ΑΜΚΑ" });

/** ΑΜ: null for orphans/splits, otherwise a 1–4 digit registry number. */
const z_Am = z.number().int().min(1, "Μη έγκυρο ΑΜ").max(9999, "Μη έγκυρο ΑΜ").nullable();

export const z_Pupils = z.object({
	id: positiveInt("Μη έγκυρο id"),
	am: z_Am,
	orphan_code: z.string("Μη έγκυρος κωδικός εκκρεμότητας"),
	split_from_am: z.number().int().min(1).max(9999).nullable(),
	first_name: z.string("Μη έγκυρο όνομα"),
	last_name: z.string("Μη έγκυρο επώνυμο"),
	fathers_name: z.string("Μη έγκυρο όνομα πατέρα"),
	birth_date: z.number().int("Μη έγκυρη ημερομηνία γέννησης"),
	road: z.string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: z.string("Μη έγκυρη περιοχή"),
	telephone: z.string("Μη έγκυρο τηλέφωνο"),
	cellphone: z.string("Μη έγκυρο κινητό τηλέφωνο"),
	email: z.string("Μη έγκυρο email"),
	amka: z_Amka,
	registration_url: z.string("Μη έγκυρο registration_url"),
	needs_review: looseBoolean("Μη έγκυρη σήμανση ελέγχου"),
	review_note: z.string("Μη έγκυρη σημείωση ελέγχου"),
	created_at: positiveInt("Μη έγκυρη ημερομηνία δημιουργίας"),
	updated_at: positiveInt("Μη έγκυρη ημερομηνία ενημέρωσης"),
});

export const z_PupilEnrollments = z.object({
	id: positiveInt("Μη έγκυρο id"),
	pupil_id: positiveInt("Μη έγκυρο pupil_id"),
	registration_year: z.string("Μη έγκυρο έτος εγγραφής"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	class_year: z.string("Μη έγκυρο έτος τάξης"),
	teacher_id: z.number().int().min(-1, "Μη έγκυρος καθηγητής"),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: positiveInt("Μη έγκυρο ποσό πληρωμής"),
	total_payment: positiveInt("Μη έγκυρο συνολικό ποσό πληρωμής"),
	payment_date: positiveInt("Μη έγκυρη ημερομηνία πληρωμής").nullable().optional(),
	pass: looseBoolean("Μη έγκυρη προαγωγή"),
	source: z.string("Μη έγκυρη πηγή εγγραφής"),
	created_at: positiveInt("Μη έγκυρη ημερομηνία δημιουργίας"),
});

/**
 * Joined enrollment row — the shape the admin table, the Excel/PDF exports and
 * the PDF worker consume (a superset of the old `registrations` row).
 *
 * `am` is a STRING to stay wire-compatible with the legacy contract ('706');
 * orphans carry their `orphan_code` instead.
 */
export const z_JoinedEnrollments = z.object({
	id: positiveInt("Μη έγκυρο id"),
	pupil_id: positiveInt("Μη έγκυρο pupil_id"),
	am: z.string("Μη έγκυρο ΑΜ"),
	orphan_code: z.string("Μη έγκυρος κωδικός εκκρεμότητας"),
	split_from_am: z.number().int().min(1).max(9999).nullable(),
	last_name: z.string("Μη έγκυρο επώνυμο"),
	first_name: z.string("Μη έγκυρο όνομα"),
	fathers_name: z.string("Μη έγκυρο όνομα πατέρα"),
	birth_date: z.number().int("Μη έγκυρη ημερομηνία γέννησης"),
	road: z.string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: z.string("Μη έγκυρη περιοχή"),
	telephone: z.string("Μη έγκυρο τηλέφωνο"),
	cellphone: z.string("Μη έγκυρο κινητό τηλέφωνο"),
	email: z.string("Μη έγκυρο email"),
	amka: z_Amka,
	registration_url: z.string("Μη έγκυρο registration_url"),
	needs_review: looseBoolean("Μη έγκυρη σήμανση ελέγχου"),
	registration_year: z.string("Μη έγκυρο έτος εγγραφής"),
	class_year: z.string("Μη έγκυρο έτος τάξης"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	teacher_id: z.number().int().min(-1, "Μη έγκυρος καθηγητής"),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: positiveInt("Μη έγκυρο ποσό πληρωμής"),
	total_payment: positiveInt("Μη έγκυρο συνολικό ποσό πληρωμής"),
	payment_date: positiveInt("Μη έγκυρη ημερομηνία πληρωμής").nullable().optional(),
	pass: looseBoolean("Μη έγκυρη προαγωγή"),
});

/** Μαθητολόγιο search result — one row per pupil, with history summary. */
export const z_PupilSearchResult = z.object({
	id: positiveInt("Μη έγκυρο id"),
	am: z_Am,
	orphan_code: z.string(),
	split_from_am: z.number().int().min(1).max(9999).nullable(),
	first_name: z.string(),
	last_name: z.string(),
	fathers_name: z.string(),
	birth_date: z.number().int("Μη έγκυρη ημερομηνία γέννησης"),
	telephone: z.string(),
	cellphone: z.string(),
	email: z.string(),
	amka: z.string(),
	needs_review: looseBoolean(),
	enrollment_count: positiveInt("Μη έγκυρο πλήθος εγγραφών"),
	last_registration_year: z.string(),
	/** Comma-separated class_ids the pupil has ever enrolled in ('0,1'). */
	music_types: z.string(),
});

export const z_PupilSearchResponse = z.object({
	rows: z.array(z_PupilSearchResult),
	total: positiveInt("Μη έγκυρο σύνολο"),
	page: positiveInt("Μη έγκυρη σελίδα"),
	pageSize: positiveInt("Μη έγκυρο μέγεθος σελίδας"),
});

/** Pupil + full history, grouped by music type. */
export const z_PupilWithEnrollments = z.object({
	pupil: z_Pupils,
	enrollments: z.array(z_PupilEnrollments),
});

export const z_Announcements = z.object({
	id: positiveInt("Μη έγκυρο id"),
	title: z.string().min(1, "Μη έγκυρος τίτλος"),
	content: z.string("Μη έγκυρο περιεχόμενο"),
	date: z.number().int("Μη έγκυρη ημερομηνία"),
	views: positiveInt("Μη έγκυρες προβολές"),
	links: z.string("Μη έγκυροι σύνδεσμοι"),
});

export const z_AnnouncementImages = z.object({
	id: positiveInt("Μη έγκυρο id"),
	announcement_id: positiveInt("Μη έγκυρο announcement_id"),
	name: z.string("Μη έγκυρο όνομα"),
	is_main: looseBoolean("Μη έγκυρη κύρια εικόνα"),
});

export const z_QueryLogs = z.object({
	id: z.string(),
	query: z.string(),
	args: z.string(),
	date: positiveInt(),
	error: looseBoolean(),
});

/** Cross-realm safe Blob check (workerd Blob is not `instanceof` the module realm's Blob). */
export const z_BlobUpload = z.custom<Blob>((v) => typeof (v as any)?.arrayBuffer === "function", {
	error: "Μη έγκυρο αρχείο",
});

/** File/blob fields used by multipart image uploads.*/
export const z_AnnouncementImageUpload = z.object({
	name: z.string("Μη έγκυρο όνομα"),
	announcement_id: positiveInt("Μη έγκυρο announcement_id"),
	is_main: looseBoolean("Μη έγκυρη κύρια εικόνα"),
	id: positiveInt("Μη έγκυρο id").optional(),
	fileData: z_BlobUpload,
	fileType: z.string("Μη έγκυρος τύπος αρχείου"),
});

/** Standard upload payload (teacher picture/cv, location image, pdf). */
export const z_FileUpload = z.object({
	name: z.string("Μη έγκυρο όνομα").optional(),
	fileType: z.string("Μη έγκυρος τύπος αρχείου"),
	fileData: z.instanceof(Blob, { error: "Μη έγκυρο αρχείο" }),
});

/** Re-export entity interfaces for convenience (same shapes as before). */
export type {
	AnnouncementImages,
	Announcements,
	Books,
	ClassType,
	EmailSubscriptions,
	Instruments,
	JoinedEnrollments,
	Locations,
	Payments,
	Payoffs,
	PupilEnrollments,
	PupilSearchResult,
	Pupils,
	QueryLogs,
	Registrations,
	SysUserRegisterLink,
	SysUsers,
	TeacherClasses,
	TeacherInstruments,
	TeacherLocations,
	Teachers,
	Wholesalers,
} from "@_types/entities";

/**
 * Response (DB row) schemas — outputs match the entity interfaces exactly
 * (stricter outputs than the request schemas: booleans, non-optional payment
 * fields, nullable strings normalized per the interfaces).
 */
export const z_LocationsResponse = z.object({
	id: positiveInt("Μη έγκυρο id"),
	name: z.string("Μη έγκυρο όνομα"),
	address: z.string("Μη έγκυρη διεύθυνση"),
	areacode: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	municipality: z.string("Μη έγκυρος δήμος"),
	email: z
		.string()
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	manager: z
		.string()
		.nullable()
		.transform((v) => v ?? ""),
	telephones: z.string("Μη έγκυρα τηλέφωνα"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	image: z
		.string()
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	map: z.string("Μη έγκυρος σύνδεσμος Google maps"),
	link: z
		.string()
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	youtube: z
		.string()
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
	partner: looseBoolean(),
});

// `z_RegistrationsResponse` was removed with the `Registrations` route group:
// enrollment reads now return the joined row (`z_JoinedEnrollments`).


export const z_TeacherClassesResponse = z.object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	class_id: positiveInt("Μη έγκυρο class_id"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	registration_number: z
		.string("Μη έγκυρος αριθμός έγκρισης")
		.nullable()
		.transform((v) => v ?? undefined)
		.optional(),
});

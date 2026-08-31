/**
 * Zod schemas — Phase 4 ports of the valibot `v_*` schemas in
 * `types/entities.ts` (kept alongside until the old route system is retired).
 *
 * Greek validation messages preserved.
 */
import { z } from "astro/zod";

export type Insert = { insertId: number };

const looseBoolean = (message = "Μη έγκυρο loose boolean") =>
	z.union([z.boolean(), z.literal(0), z.literal(1)], { message }).transform((v) => v === true);
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
	email: z.union([z.email("Μη έγκυρο email"), z.literal("")]).nullable().transform((v) => v ?? undefined).optional(),
	telephone: z.string("Μη έγκυρο τηλέφωνο").nullable().transform((v) => v ?? undefined).optional(),
	linktree: z.string("Μη έγκυρο linktree").nullable().transform((v) => v ?? undefined).optional(),
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

/** File/blob fields used by multipart image uploads. */
export const z_AnnouncementImageUpload = z.object({
	name: z.string("Μη έγκυρο όνομα"),
	announcement_id: positiveInt("Μη έγκυρο announcement_id"),
	is_main: looseBoolean("Μη έγκυρη κύρια εικόνα"),
	id: positiveInt("Μη έγκυρο id").optional(),
	fileData: z_BlobUpload,
	thumbData: z_BlobUpload.optional(),
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
	Books,
	Payments,
	Payoffs,
	Wholesalers,
	SysUsers,
	SysUserRegisterLink,
	Teachers,
	TeacherLocations,
	TeacherClasses,
	ClassType,
	Locations,
	Instruments,
	TeacherInstruments,
	Registrations,
	EmailSubscriptions,
	Announcements,
	AnnouncementImages,
	QueryLogs,
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
	email: z.string().nullable().transform((v) => v ?? undefined).optional(),
	manager: z.string().nullable().transform((v) => v ?? ""),
	telephones: z.string("Μη έγκυρα τηλέφωνα"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	image: z.string().nullable().transform((v) => v ?? undefined).optional(),
	map: z.string("Μη έγκυρος σύνδεσμος Google maps"),
	link: z.string().nullable().transform((v) => v ?? undefined).optional(),
	youtube: z.string().nullable().transform((v) => v ?? undefined).optional(),
	partner: looseBoolean(),
});

export const z_RegistrationsResponse = z.object({
	id: positiveInt("Μη έγκυρο id"),
	am: z.string("Μη έγκυρο ΑΜ"),
	amka: z.string(),
	first_name: z.string("Μη έγκυρο όνομα"),
	last_name: z.string("Μη έγκυρο επώνυμο"),
	fathers_name: z.string("Μη έγκυρο όνομα πατέρα"),
	birth_date: z.number().int(),
	telephone: z.string("Μη έγκυρο τηλέφωνο"),
	cellphone: z.string("Μη έγκυρο κινητό τηλέφωνο"),
	email: z.string(),
	road: z.string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: z.string("Μη έγκυρη περιοχή"),
	registration_year: z.string("Μη έγκυρο έτος εγγραφής"),
	class_year: z.string("Μη έγκυρο έτος τάξης"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	teacher_id: z.number().int().min(-1),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: z.number(),
	total_payment: z.number(),
	payment_date: z.number().nullable().optional(),
	registration_url: z.string().optional(),
	pass: looseBoolean(),
});

export const z_TeacherClassesResponse = z.object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	class_id: positiveInt("Μη έγκυρο class_id"),
	priority: z.number().int().min(1, "Μη έγκυρη προτεραιότητα"),
	registration_number: z.string().optional(),
});



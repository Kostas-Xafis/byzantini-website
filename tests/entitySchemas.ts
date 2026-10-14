/**
 * Valibot response-shape assertions for the API suite (`expectBody(json, v_X)`).
 *
 * These used to live in `types/entities.ts`, which made valibot a runtime
 * dependency of the app; they moved here so valibot is test-only (a
 * devDependency). The app's single source of entity shapes is the zod schemas
 * in `lib/api/schemas.ts` — porting these assertions to them is a follow-up.
 */
import { boolean, email, integer, length, literal, minLength, minValue, nullable, number, object, optional, string, union } from "valibot";

const looseBoolean = (error?: string) => union([boolean(), literal(0), literal(1)], error || "Μη έγκυρο loose boolean");
const positiveInt = (error?: string) => number(error || "Μη έγκυρος θετικός ακέραιος", [integer(), minValue(0)]);

export const v_Books = object({
	id: positiveInt("Μη έγκυρο id"),
	title: string("Μη έγκυρος τίτλος βιβλίου", [minLength(1)]),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	wholesale_price: positiveInt("Μη έγκυρη τιμή χονδρικής"),
	price: positiveInt("Μη έγκυρη τιμή"),
	quantity: positiveInt("Μη έγκυρη ποσότητα"),
	sold: positiveInt("Μη έγκυρο πλήθος πωλήσεων"),
});

export const v_Payments = object({
	id: positiveInt("Μη έγκυρο id"),
	student_name: string("Μη έγκυρο όνομα μαθητή", [minLength(1)]),
	book_id: positiveInt("Μη έγκυρο book_id"),
	amount: positiveInt("Μη έγκυρο ποσό"),
	book_amount: number("Μη έγκυρο πλήθος βιβλίων", [integer(), minValue(1)]),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_date: optional(positiveInt("Μη έγκυρη ημερομηνία πληρωμής")),
});

export const v_Payoffs = object({
	id: positiveInt("Μη έγκυρο id"),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	amount: positiveInt("Μη έγκυρο ποσό"),
});

export const v_Wholesalers = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα", [minLength(1)]),
});

export const v_SysUsers = object({
	id: positiveInt("Μη έγκυρο id"),
	email: string("Μη έγκυρο email", [email()]),
	password: string("Μη έγκυρος κωδικός", [minLength(1)]),
	session_id: string("Μη έγκυρο session_id", [minLength(1)]),
	session_exp_date: positiveInt("Μη έγκυρη ημερομηνία λήξης session"),
});

export const v_Teachers = object({
	id: positiveInt("Μη έγκυρο id"),
	fullname: string("Μη έγκυρο ονοματεπώνυμο", [minLength(1)]),
	picture: nullable(string("Μη έγκυρη εικόνα")),
	cv: nullable(string("Μη έγκυρο βιογραφικό")),
	email: optional(union([string("Μη έγκυρο email", [email()]), literal("")])),
	telephone: optional(string("Μη έγκυρο τηλέφωνο")),
	linktree: optional(string("Μη έγκυρο linktree")),
	gender: union([literal("M"), literal("F")], "Μη έγκυρο φύλο"),
	title: union([literal(0), literal(1), literal(2)], "Μη έγκυρος τίτλος δασκάλου"), // 0: Καθηγητής, 1: Δάσκαλος, 2: Επιμελητής
	visible: looseBoolean("Μη έγκυρη ορατότητα"),
	online: looseBoolean("Μη έγκυρη σύνδεση"),
	amka: union([string([length(11)]), literal("")], "Μη έγκυρο ΑΜΚΑ"),
});

export const v_TeacherLocations = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	location_id: positiveInt("Μη έγκυρο location_id"),
});

export const v_TeacherClasses = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	class_id: positiveInt("Μη έγκυρο class_id"),
	priority: number("Μη έγκυρη προτεραιότητα", [integer(), minValue(1)]),
	registration_number: optional(nullable(string("Μη έγκυρος αριθμός έγκρισης"))), //Αριθμός Έγκρισης
});

export const v_Locations = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα"),
	address: string("Μη έγκυρη διεύθυνση"),
	areacode: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	municipality: string("Μη έγκυρος δήμος"),
	email: optional(string([email("Μη έγκυρο email")])),
	manager: string("Μη έγκυρος διαχειριστής"),
	telephones: string("Μη έγκυρα τηλέφωνα"),
	priority: number([integer("Μη έγκυρη προτεραιότητα"), minValue(1)]),
	image: optional(string("Μη έγκυρη εικόνα")),
	map: string("Μη έγκυρος σύνδεσμος Google maps"),
	link: optional(string("Μη έγκυρος σύνδεσμος")),
	youtube: optional(string("Μη έγκυρος σύνδεσμος Youtube")),
	partner: looseBoolean("Μη έγκυρος συνεργάτης"),
});

export const v_Instruments = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα", [minLength(1)]),
	type: union([literal("par"), literal("eur")], "Μη έγκυρος τύπος"),
	isInstrument: looseBoolean("Μη έγκυρο μουσικό όργανο"),
});

export const v_TeacherInstruments = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	instrument_id: positiveInt("Μη έγκυρο instrument_id"),
});

export const v_Pupils = object({
	id: positiveInt("Μη έγκυρο id"),
	am: nullable(positiveInt("Μη έγκυρο ΑΜ")),
	orphan_code: string("Μη έγκυρος κωδικός εκκρεμότητας"),
	split_from_am: nullable(positiveInt("Μη έγκυρο split_from_am")),
	first_name: string("Μη έγκυρο όνομα"),
	last_name: string("Μη έγκυρο επώνυμο"),
	fathers_name: string("Μη έγκυρο όνομα πατέρα"),
	birth_date: number("Μη έγκυρη ημερομηνία γέννησης", [integer()]),
	road: string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: string("Μη έγκυρη περιοχή"),
	telephone: string("Μη έγκυρο τηλέφωνο"),
	cellphone: string("Μη έγκυρο κινητό τηλέφωνο"),
	email: string("Μη έγκυρο email"),
	amka: union([string([length(11)]), literal("")], "Μη έγκυρο ΑΜΚΑ"),
	registration_url: string("Μη έγκυρο registration_url"),
	needs_review: looseBoolean("Μη έγκυρη σήμανση ελέγχου"),
	review_note: string("Μη έγκυρη σημείωση ελέγχου"),
	created_at: positiveInt("Μη έγκυρη ημερομηνία δημιουργίας"),
	updated_at: positiveInt("Μη έγκυρη ημερομηνία ενημέρωσης"),
});

export const v_PupilEnrollments = object({
	id: positiveInt("Μη έγκυρο id"),
	pupil_id: positiveInt("Μη έγκυρο pupil_id"),
	registration_year: string("Μη έγκυρο έτος εγγραφής"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	class_year: string("Μη έγκυρο έτος τάξης"),
	teacher_id: number("Μη έγκυρος καθηγητής", [integer(), minValue(-1)]),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: positiveInt("Μη έγκυρο ποσό πληρωμής"),
	total_payment: positiveInt("Μη έγκυρο συνολικό ποσό πληρωμής"),
	payment_date: optional(nullable(positiveInt("Μη έγκυρη ημερομηνία πληρωμής"))),
	pass: looseBoolean("Μη έγκυρη προαγωγή"),
	source: string("Μη έγκυρη πηγή εγγραφής"),
	created_at: positiveInt("Μη έγκυρη ημερομηνία δημιουργίας"),
});

export const v_Announcements = object({
	id: positiveInt("Μη έγκυρο id"),
	title: string("Μη έγκυρος τίτλος", [minLength(1)]),
	content: string("Μη έγκυρο περιεχόμενο"),
	date: number("Μη έγκυρη ημερομηνία", [integer()]),
	views: positiveInt("Μη έγκυρες προβολές"),
	links: string("Μη έγκυροι σύνδεσμοι"),
});

export const v_AnnouncementImages = object({
	id: positiveInt("Μη έγκυρο id"),
	announcement_id: positiveInt("Μη έγκυρο announcement_id"),
	name: string("Μη έγκυρο όνομα"),
	is_main: looseBoolean("Μη έγκυρη κύρια εικόνα"),
});

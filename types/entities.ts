export type Insert = { insertId: number };

export interface Books {
	id: number;
	title: string;
	wholesaler_id: number;
	wholesale_price: number;
	price: number;
	quantity: number;
	sold: number;
}

export interface Payments {
	id: number;
	student_name: string;
	book_id: number;
	amount: number;
	book_amount: number;
	date: number;
	payment_date?: number | undefined;
}

export interface Payoffs {
	id: number;
	wholesaler_id: number;
	amount: number;
}

export interface Wholesalers {
	id: number;
	name: string;
}

export interface SysUsers {
	id: number;
	email: string;
	password: string;
	session_id: string;
	session_exp_date: number;
}

export interface SysUserRegisterLink {
	link: string;
	exp_date: number;
	/** The invited email — the account created from the link must use it. */
	email: string | null;
}

export interface LoginCredentials {}

export interface Teachers {
	id: number;
	fullname: string;
	picture: string | null;
	cv: string | null;
	email?: string | undefined;
	telephone?: string | undefined;
	linktree?: string | undefined;
	gender: "M" | "F";
	title: 0 | 1 | 2;
	visible: boolean;
	online: boolean;
	amka: string;
}

export type SimpleTeacher = Omit<Teachers, "picture" | "cv">;

export interface TeacherLocations {
	teacher_id: number;
	location_id: number;
}

export interface TeacherClasses {
	teacher_id: number;
	class_id: number;
	priority: number;
	registration_number?: string | undefined;
}

export interface ClassType {
	id: number;
	name: string;
}

export interface Locations {
	id: number;
	name: string;
	address: string;
	areacode: number;
	municipality: string;
	email?: string | undefined;
	manager: string;
	telephones: string;
	priority: number;
	image?: string | undefined;
	map: string;
	link?: string | undefined;
	youtube?: string | undefined;
	partner: boolean;
}

export interface Instruments {
	id: number;
	name: string;
	type: "par" | "eur";
	isInstrument: boolean;
}

export interface TeacherInstruments {
	teacher_id: number;
	instrument_id: number;
}

export interface Registrations {
	id: number;
	am: string;
	amka: string;
	first_name: string;
	last_name: string;
	fathers_name: string;
	birth_date: number;
	telephone: string;
	cellphone: string;
	email: string;
	road: string;
	number: number;
	tk: number;
	region: string;
	registration_year: string;
	class_year: string;
	class_id: number;
	teacher_id: number;
	instrument_id: number;
	date: number;
	payment_amount: number;
	total_payment: number;
	payment_date?: number | null;
	registration_url?: string | undefined;
	pass: boolean;
}

// The old `StudentRecord` / `StudentClass` sketch that used to live here was
// implemented for real as `Pupils` / `PupilEnrollments` below (migration
// 0002_pupils.sql).

/**
 * Pupil register (Μαθητολόγιο) — replaces the person half of `registrations`.
 *
 * `am` is NULL when the pupil has no usable ΑΜ: either a true orphan (no ΑΜ at
 * all, see `orphan_code`) or a row split off a shared ΑΜ (see `split_from_am`).
 * `registration_url` is permanent — the links already emailed to students keep
 * working forever.
 */
export interface Pupils {
	id: number;
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	first_name: string;
	last_name: string;
	fathers_name: string;
	birth_date: number;
	road: string;
	number: number;
	tk: number;
	region: string;
	telephone: string;
	cellphone: string;
	email: string;
	amka: string;
	registration_url: string;
	needs_review: boolean;
	review_note: string;
	created_at: number;
	updated_at: number;
}

/** One year / music type / instrument of a pupil's history. */
export interface PupilEnrollments {
	id: number;
	pupil_id: number;
	registration_year: string;
	class_id: number;
	class_year: string;
	teacher_id: number;
	instrument_id: number;
	date: number;
	payment_amount: number;
	total_payment: number;
	payment_date?: number | null;
	pass: boolean;
	source: string;
	created_at: number;
}

/**
 * Joined row returned by the enrollment listing routes: the enrollment plus its
 * pupil's identity, in the exact shape the admin table, the Excel/PDF exports
 * and the PDF worker expect (a superset of the old `registrations` row).
 *
 * `am` is a STRING here on purpose: the legacy contract (and every export) wants
 * '706'. Orphans have no ΑΜ, so `orphan_code` ('000-Ο1') stands in for it.
 */
export interface JoinedEnrollments extends Omit<Pupils, "id" | "am" | "created_at" | "updated_at" | "review_note"> {
	/** The enrollment id (the old `registrations.id`). */
	id: number;
	/** The pupil's id (what the Μαθητολόγιο links to). */
	pupil_id: number;
	/** String form of the pupil's ΑΜ, or their orphan code when there is none. */
	am: string;
	registration_year: string;
	class_year: string;
	class_id: number;
	teacher_id: number;
	instrument_id: number;
	date: number;
	payment_amount: number;
	total_payment: number;
	payment_date?: number | null;
	pass: boolean;
}

/** Search result row: enough for the Μαθητολόγιο list without the history. */
export interface PupilSearchResult {
	id: number;
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	first_name: string;
	last_name: string;
	fathers_name: string;
	birth_date: number;
	telephone: string;
	cellphone: string;
	email: string;
	amka: string;
	needs_review: boolean;
	enrollment_count: number;
	last_registration_year: string;
	music_types: string;
}

export interface EmailSubscriptions {
	email: string;
	unsubscribe_token: string;
	unrelated: boolean;
}

export interface Announcements {
	id: number;
	title: string;
	content: string;
	date: number;
	views: number;
	links: string;
}

//! Later on rename the priority column to id
export interface AnnouncementImages {
	id: number;
	announcement_id: number;
	name: string;
	is_main: boolean;
}

// Dev mode only
export interface QueryLogs {
	id: string;
	query: string;
	args: string;
	date: number;
	error: boolean;
}

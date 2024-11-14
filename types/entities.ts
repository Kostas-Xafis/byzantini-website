import {
	boolean,
	email,
	integer,
	length,
	literal,
	minLength,
	minValue,
	nullable,
	number,
	object,
	omit,
	optional,
	string,
	union,
} from "valibot";

export type Insert = { insertId: number; };

const looseBoolean = (error?: string) => union([boolean(), literal(0), literal(1)], error || "Μη έγκυρο loose boolean");
const positiveInt = (error?: string) => number(error || "Μη έγκυρος θετικός ακέραιος", [integer(), minValue(0)]);

export const v_Books = object({
	id: positiveInt("Μη έγκυρο id"),
	title: string("Μη έγκυρος τίτλος βιβλίου", [minLength(1)]),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	wholesale_price: positiveInt("Μη έγκυρη τιμή χονδρικής"),
	price: positiveInt("Μη έγκυρη τιμή"),
	quantity: positiveInt("Μη έγκυρη ποσότητα"),
	sold: positiveInt("Μη έγκυρο πλήθος πωλήσεων")
});
export interface Books {
	id: number;
	title: string;
	wholesaler_id: number;
	wholesale_price: number;
	price: number;
	quantity: number;
	sold: number;
};

export const v_Payments = object({
	id: positiveInt("Μη έγκυρο id"),
	student_name: string("Μη έγκυρο όνομα μαθητή", [minLength(1)]),
	book_id: positiveInt("Μη έγκυρο book_id"),
	amount: positiveInt("Μη έγκυρο ποσό"),
	book_amount: number("Μη έγκυρο πλήθος βιβλίων", [integer(), minValue(1)]),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_date: optional(positiveInt("Μη έγκυρη ημερομηνία πληρωμής"))
});
export interface Payments {
	id: number;
	student_name: string;
	book_id: number;
	amount: number;
	book_amount: number;
	date: number;
	payment_date?: number | undefined;
};

export const v_Payoffs = object({
	id: positiveInt("Μη έγκυρο id"),
	wholesaler_id: positiveInt("Μη έγκυρο wholesaler_id"),
	amount: positiveInt("Μη έγκυρο ποσό")
});
export interface Payoffs {
	id: number;
	wholesaler_id: number;
	amount: number;
};

export const v_Wholesalers = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα", [minLength(1)])
});
export interface Wholesalers {
	id: number;
	name: string;
};

export const v_SysUsers = object({
	id: positiveInt("Μη έγκυρο id"),
	email: string("Μη έγκυρο email", [email()]),
	password: string("Μη έγκυρος κωδικός", [minLength(1)]),
	session_id: string("Μη έγκυρο session_id", [minLength(1)]),
	session_exp_date: positiveInt("Μη έγκυρη ημερομηνία λήξης session"),
	privilege: number("Μη έγκυρο προνόμιο διαχειριστή"),
});
export interface SysUsers {
	id: number;
	email: string;
	password: string;
	session_id: string;
	session_exp_date: number;
	privilege: number;
};

export const v_SysUserRegisterLink = object({
	link: string("Μη έγκυρος σύνδεσμος", [minLength(1)]),
	exp_date: positiveInt("Μη έγκυρη ημερομηνία λήξης"),
	privilege: positiveInt("Μη έγκυρο προνόμιο")
});
export interface SysUserRegisterLink {
	link: string;
	exp_date: number;
	privilege: number;
};

export const v_LoginCredentials = object({
	email: string("Μη έγκυρο email", [email()]),
	password: string("Μη έγκυρος κωδικός", [minLength(1)])
});
export interface LoginCredentials {

};

export const v_Teachers = object({
	id: positiveInt("Μη έγκυρο id"),
	fullname: string("Μη έγκυρο ονοματεπώνυμο", [minLength(1)]),
	picture: nullable(string("Μη έγκυρη εικόνα")),
	cv: nullable(string("Μη έγκυρο βιογραφικό")),
	email: optional(string("Μη έγκυρο email", [email()])),
	telephone: optional(string("Μη έγκυρο τηλέφωνο")),
	linktree: optional(string("Μη έγκυρο linktree")),
	gender: union([literal("M"), literal("F")], "Μη έγκυρο φύλο"),
	title: union([literal(0), literal(1), literal(2)], "Μη έγκυρος τίτλος δασκάλου"), // 0: Καθηγητής, 1: Δάσκαλος, 2: Επιμελητής
	visible: looseBoolean("Μη έγκυρη ορατότητα"),
	online: looseBoolean("Μη έγκυρη σύνδεση"),
	amka: union([string([length(11)]), literal("")], "Μη έγκυρο ΑΜΚΑ"),
});
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
};

export const v_SimpleTeacher = omit(v_Teachers, ["picture", "cv"]);
export type SimpleTeacher = Omit<Teachers, "picture" | "cv">;

export const v_TeacherLocations = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	location_id: positiveInt("Μη έγκυρο location_id")
});
export interface TeacherLocations {
	teacher_id: number;
	location_id: number;
};

export const v_TeacherClasses = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	class_id: positiveInt("Μη έγκυρο class_id"),
	priority: number("Μη έγκυρη προτεραιότητα", [integer(), minValue(1)]),
	registration_number: optional(nullable(string("Μη έγκυρος αριθμός έγκρισης"))), //Αριθμός Έγκρισης
});
export interface TeacherClasses {
	teacher_id: number;
	class_id: number;
	priority: number;
	registration_number?: string | undefined;
};

export const v_ClassType = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα", [minLength(1)])
});
export interface ClassType {
	id: number;
	name: string;
};

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
};

export const v_Instruments = object({
	id: positiveInt("Μη έγκυρο id"),
	name: string("Μη έγκυρο όνομα", [minLength(1)]),
	type: union([literal("par"), literal("eur")], "Μη έγκυρος τύπος"),
	isInstrument: looseBoolean("Μη έγκυρο μουσικό όργανο")
});
export interface Instruments {
	id: number;
	name: string;
	type: "par" | "eur";
	isInstrument: boolean;
};

export const v_TeacherInstruments = object({
	teacher_id: positiveInt("Μη έγκυρο teacher_id"),
	instrument_id: positiveInt("Μη έγκυρο instrument_id")
});
export interface TeacherInstruments {
	teacher_id: number;
	instrument_id: number;
};

export const v_Registrations = object({
	id: positiveInt("Μη έγκυρο id"),
	am: string("Μη έγκυρο ΑΜ"),
	amka: union([string([length(11)]), literal("")], "Μη έγκυρο ΑΜΚΑ"),
	first_name: string("Μη έγκυρο όνομα"),
	last_name: string("Μη έγκυρο επώνυμο"),
	fathers_name: string("Μη έγκυρο όνομα πατέρα"),
	birth_date: number("Μη έγκυρη ημερομηνία γέννησης", [integer()]),
	telephone: string("Μη έγκυρο τηλέφωνο"),
	cellphone: string("Μη έγκυρο κινητό τηλέφωνο"),
	email: string("Μη έγκυρο email", [email()]),
	road: string("Μη έγκυρος δρόμος"),
	number: positiveInt("Μη έγκυρος αριθμός"),
	tk: positiveInt("Μη έγκυρος ταχυδρομικός κώδικας"),
	region: string("Μη έγκυρη περιοχή"),
	registration_year: string("Μη έγκυρο έτος εγγραφής"),
	class_year: string("Μη έγκυρο έτος τάξης"),
	class_id: positiveInt("Μη έγκυρο μάθημα"),
	teacher_id: number("Μη έγκυρος καθηγητής", [integer(), minValue(-1)]),
	instrument_id: positiveInt("Μη έγκυρο μουσικό όργανο"),
	date: positiveInt("Μη έγκυρη ημερομηνία"),
	payment_amount: optional(positiveInt("Μη έγκυρο ποσό πληρωμής")),
	total_payment: optional(positiveInt("Μη έγκυρο συνολικό ποσό πληρωμής")),
	payment_date: optional(nullable(positiveInt("Μη έγκυρη ημερομηνία πληρωμής"))),
	registration_url: optional(string("Μη έγκυρο registration_url")),
	pass: looseBoolean("Μη έγκυρο προαγωγή")
});
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
};

export const v_EmailSubscriptions = object({
	email: string([email("Μη έγκυρο email")]),
	unsubscribe_token: string("Μη έγκυρο unsubscribe_token"),
	unrelated: looseBoolean("Μη έγκυρο unrelated"),
});
export interface EmailSubscriptions {
	email: string;
	unsubscribe_token: string;
	unrelated: boolean;
};

export const v_Announcements = object({
	id: positiveInt("Μη έγκυρο id"),
	title: string("Μη έγκυρος τίτλος", [minLength(1)]),
	content: string("Μη έγκυρο περιεχόμενο"),
	date: number("Μη έγκυρη ημερομηνία", [integer()]),
	views: positiveInt("Μη έγκυρες προβολές"),
	links: string("Μη έγκυροι σύνδεσμοι")
});
export interface Announcements {
	id: number;
	title: string;
	content: string;
	date: number;
	views: number;
	links: string;
};

//! Later on rename the priority column to id
export const v_AnnouncementImages = object({
	id: positiveInt("Μη έγκυρο id"),
	announcement_id: positiveInt("Μη έγκυρο announcement_id"),
	name: string("Μη έγκυρο όνομα"),
	is_main: looseBoolean("Μη έγκυρη κύρια εικόνα")
});
export interface AnnouncementImages {
	id: number;
	announcement_id: number;
	name: string;
	is_main: boolean;
};

// Dev mode only
export const v_QueryLogs = object({
	id: string(),
	query: string(),
	args: string(),
	date: positiveInt(),
	error: looseBoolean(),
});

export interface QueryLogs {
	id: string;
	query: string;
	args: string;
	date: number;
	error: boolean;
};

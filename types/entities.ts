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

const looseBoolean = () => union([boolean(), literal(0), literal(1)]);
const positiveInt = () => number([integer(), minValue(0)]);

export const v_Books = object({
	id: positiveInt(),
	title: string([minLength(1)]),
	wholesaler_id: positiveInt(),
	wholesale_price: positiveInt(),
	price: positiveInt(),
	quantity: positiveInt(),
	sold: positiveInt()
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
	id: positiveInt(),
	student_name: string([minLength(1)]),
	book_id: positiveInt(),
	amount: positiveInt(),
	book_amount: number([integer(), minValue(1)]),
	date: positiveInt(),
	payment_date: optional(positiveInt())
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
	id: positiveInt(),
	wholesaler_id: positiveInt(),
	amount: positiveInt()
});
export interface Payoffs {
	id: number;
	wholesaler_id: number;
	amount: number;
};

export const v_Wholesalers = object({
	id: positiveInt(),
	name: string([minLength(1)])
});
export interface Wholesalers {
	id: number;
	name: string;
};

export const v_SysUsers = object({
	id: positiveInt(),
	email: string([email()]),
	password: string([minLength(1)]),
	session_id: string([minLength(1)]),
	session_exp_date: positiveInt(),
	privilege: number(),
	last_reg_check_id: positiveInt()
});
export interface SysUsers {
	id: number;
	email: string;
	password: string;
	session_id: string;
	session_exp_date: number;
	privilege: number;
	last_reg_check_id: number;
};

export const v_SysUserRegisterLink = object({
	link: string([minLength(1)]),
	exp_date: positiveInt(),
	privilege: positiveInt()
});
export interface SysUserRegisterLink {
	link: string;
	exp_date: number;
	privilege: number;
};

export const v_LoginCredentials = object({
	email: string([email()]),
	password: string()
});
export interface LoginCredentials {

};

export const v_Teachers = object({
	id: positiveInt(),
	fullname: string([minLength(1)]),
	picture: nullable(string()),
	cv: nullable(string()),
	email: optional(string()),
	telephone: optional(string()),
	linktree: optional(string()),
	gender: union([literal("M"), literal("F")]),
	title: union([literal(0), literal(1), literal(2)]), // 0: Καθηγητής, 1: Δάσκαλος, 2: Επιμελητής
	visible: looseBoolean(),
	online: looseBoolean(),
	amka: union([string([length(11)]), literal("")]),
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
	teacher_id: positiveInt(),
	location_id: positiveInt()
});
export interface TeacherLocations {
	teacher_id: number;
	location_id: number;
};

export const v_TeacherClasses = object({
	teacher_id: positiveInt(),
	class_id: positiveInt(),
	priority: number([integer(), minValue(1)]),
	registration_number: optional(nullable(string())), //Αριθμός Έγκρισης
});
export interface TeacherClasses {
	teacher_id: number;
	class_id: number;
	priority: number;
	registration_number?: string | undefined;
};

export const v_ClassType = object({
	id: positiveInt(),
	name: string([minLength(1)])
});
export interface ClassType {
	id: number;
	name: string;
};

export const v_Locations = object({
	id: positiveInt(),
	name: string(),
	address: string(),
	areacode: positiveInt(),
	municipality: string(),
	email: optional(string([email()])),
	manager: string(),
	telephones: string(),
	priority: number([integer(), minValue(1)]),
	image: optional(string()),
	map: string(),
	link: optional(string()),
	youtube: optional(string()),
	partner: looseBoolean(),
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
	id: positiveInt(),
	name: string([minLength(1)]),
	type: union([literal("par"), literal("eur")]),
	isInstrument: looseBoolean()
});
export interface Instruments {
	id: number;
	name: string;
	type: "par" | "eur";
	isInstrument: boolean;
};

export const v_TeacherInstruments = object({
	teacher_id: positiveInt(),
	instrument_id: positiveInt()
});
export interface TeacherInstruments {
	teacher_id: number;
	instrument_id: number;
};

export const v_Registrations = object({
	id: positiveInt(),
	am: string(),
	amka: union([string([length(11)]), literal("")]),
	first_name: string(),
	last_name: string(),
	fathers_name: string(),
	birth_date: number([integer()]),
	telephone: string(),
	cellphone: string(),
	email: string([email()]),
	road: string(),
	number: positiveInt(),
	tk: positiveInt(),
	region: string(),
	registration_year: string(),
	class_year: string(),
	class_id: positiveInt(),
	teacher_id: number([integer(), minValue(-1)]),
	instrument_id: positiveInt(),
	date: positiveInt(),
	payment_amount: optional(positiveInt()),
	total_payment: optional(positiveInt()),
	payment_date: optional(nullable(positiveInt())),
	registration_url: optional(string()),
	pass: looseBoolean()
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
	payment_amount: number | null;
	total_payment: number | null;
	payment_date?: number | null;
	registration_url?: string | undefined;
	pass: boolean;
};

export const v_EmailSubscriptions = object({
	email: string([email()]),
	unsubscribe_token: string(),
	unrelated: looseBoolean(),
});
export interface EmailSubscriptions {
	email: string;
	unsubscribe_token: string;
	unrelated: boolean;
};

export const v_Announcements = object({
	id: positiveInt(),
	title: string([minLength(1)]),
	content: string(),
	date: number([integer()]),
	views: positiveInt(),
	image_counter: positiveInt()
});
export interface Announcements {
	id: number;
	title: string;
	content: string;
	date: number;
	views: number;
	image_counter: number;
};

//! Later on rename the priority column to id
export const v_AnnouncementImages = object({
	id: positiveInt(),
	announcement_id: positiveInt(),
	name: string(),
	is_main: looseBoolean()
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

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

export const v_Books = object({
	id: number([integer(), minValue(0)]),
	title: string([minLength(1)]),
	wholesaler_id: number([integer(), minValue(0)]),
	wholesale_price: number([integer(), minValue(0)]),
	price: number([integer(), minValue(0)]),
	quantity: number([integer(), minValue(0)]),
	sold: number([integer(), minValue(0)])
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
	id: number([integer(), minValue(0)]),
	student_name: string([minLength(1)]),
	book_id: number([integer(), minValue(0)]),
	amount: number([integer(), minValue(0)]),
	book_amount: number([integer(), minValue(1)]),
	date: number([integer(), minValue(0)]),
	payment_date: optional(number([integer(), minValue(0)]))
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
	id: number([integer(), minValue(0)]),
	wholesaler_id: number([integer(), minValue(0)]),
	amount: number([integer(), minValue(0)])
});
export interface Payoffs {
	id: number;
	wholesaler_id: number;
	amount: number;
};

export const v_Wholesalers = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)])
});
export interface Wholesalers {
	id: number;
	name: string;
};

export const v_SysUsers = object({
	id: number([integer(), minValue(0)]),
	email: string([email()]),
	password: string([minLength(1)]),
	session_id: string([minLength(1)]),
	session_exp_date: number([integer(), minValue(0)]),
	privilege: number([integer(), minValue(0)]),
	last_reg_check_id: number([integer(), minValue(0)])
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
	exp_date: number([integer(), minValue(0)]),
	privilege: number([integer(), minValue(0)])
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
	id: number([integer(), minValue(0)]),
	fullname: string([minLength(1)]),
	picture: nullable(string()),
	cv: nullable(string()),
	email: optional(string()),
	telephone: optional(string()),
	linktree: optional(string()),
	gender: union([literal("M"), literal("F")]),
	title: union([literal(0), literal(1), literal(2)]), // 0: Καθηγητής, 1: Δάσκαλος, 2: Επιμελητής
	visible: boolean(),
	online: boolean()
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
};

export const v_SimpleTeacher = omit(v_Teachers, ["picture", "cv"]);
export type SimpleTeacher = Omit<Teachers, "picture" | "cv">;

export const v_TeacherLocations = object({
	teacher_id: number([integer(), minValue(0)]),
	location_id: number([integer(), minValue(0)])
});
export interface TeacherLocations {
	teacher_id: number;
	location_id: number;
};

export const v_TeacherClasses = object({
	teacher_id: number([integer(), minValue(0)]),
	class_id: number([integer(), minValue(0)]),
	priority: number([integer(), minValue(1)]),
	registration_number: optional(string()), //Αριθμός Έγκρισης
});
export interface TeacherClasses {
	teacher_id: number;
	class_id: number;
	priority: number;
	registration_number?: string | undefined;
};


export const v_ClassType = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)])
});
export interface ClassType {
	id: number;
	name: string;
};

export const v_Locations = object({
	id: number([integer(), minValue(0)]),
	name: string(),
	address: string(),
	areacode: number([integer(), minValue(0)]),
	municipality: string(),
	email: optional(string([email()])),
	manager: string(),
	telephones: string(),
	priority: number([integer(), minValue(1)]),
	image: optional(string()),
	map: string(),
	link: optional(string()),
	youtube: optional(string()),
	partner: union([literal(1), literal(0)]),
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
	partner: 0 | 1;
};

export const v_Instruments = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)]),
	type: union([literal("par"), literal("eur")]),
	isInstrument: union([literal(1), literal(0)])
});
export interface Instruments {
	id: number;
	name: string;
	type: "par" | "eur";
	isInstrument: 0 | 1;
};

export const v_TeacherInstruments = object({
	teacher_id: number([integer(), minValue(0)]),
	instrument_id: number([integer(), minValue(0)])
});
export interface TeacherInstruments {
	teacher_id: number;
	instrument_id: number;
};

export const v_Registrations = object({
	id: number([integer(), minValue(0)]),
	am: string(),
	first_name: string(),
	last_name: string(),
	fathers_name: string(),
	birth_date: number([integer()]),
	telephone: string(),
	cellphone: string(),
	email: string([email()]),
	road: string(),
	number: number([integer(), minValue(0)]),
	tk: number([integer(), minValue(0)]),
	region: string(),
	registration_year: string(),
	class_year: string(),
	class_id: number([integer(), minValue(0)]),
	teacher_id: number([integer(), minValue(0)]),
	instrument_id: number([integer(), minValue(0)]),
	date: number([integer(), minValue(0)]),
	payment_amount: number([integer(), minValue(0)]),
	total_payment: number([integer(), minValue(0)]),
	payment_date: optional(nullable(number([integer(), minValue(0)])))
});
export interface Registrations {
	id: number;
	am: string;
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
};

export const v_EmailSubscriptions = object({
	email: string([email()]),
	unsubscribe_token: string(),
	unrelated: boolean(),
});
export interface EmailSubscriptions {
	email: string;
	unsubscribe_token: string;
	unrelated: boolean;
};

export const v_Announcements = object({
	id: number([integer(), minValue(0)]),
	title: string([minLength(1)]),
	content: string(),
	date: number([integer()]),
	views: number([integer(), minValue(0)]),
	image_counter: number([integer(), minValue(0)])
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
	id: number([integer(), minValue(0)]),
	announcement_id: number([integer(), minValue(0)]),
	name: string(),
	is_main: boolean()
});
export interface AnnouncementImages {
	id: number;
	announcement_id: number;
	name: string;
	is_main: boolean;
};

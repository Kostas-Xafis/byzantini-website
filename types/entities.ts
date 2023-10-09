import {
	object,
	number,
	integer,
	minValue,
	string,
	minLength,
	optional,
	email,
	omit,
	literal,
	union,
	type Output,
	nullable,
	boolean
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
export type Books = Output<typeof v_Books>;

export const v_Payments = object({
	id: number([integer(), minValue(0)]),
	student_name: string([minLength(1)]),
	book_id: number([integer(), minValue(0)]),
	amount: number([integer(), minValue(0)]),
	book_amount: number([integer(), minValue(1)]),
	date: number([integer(), minValue(0)]),
	payment_date: optional(number([integer(), minValue(0)]))
});
export type Payments = Output<typeof v_Payments>;

export const v_Payoffs = object({
	id: number([integer(), minValue(0)]),
	wholesaler_id: number([integer(), minValue(0)]),
	amount: number([integer(), minValue(0)])
});
export type Payoffs = Output<typeof v_Payoffs>;

export const v_Wholesalers = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)])
});
export type Wholesalers = Output<typeof v_Wholesalers>;

export const v_SysUsers = object({
	id: number([integer(), minValue(0)]),
	email: string([email()]),
	password: string([minLength(1)]),
	session_id: string([minLength(1)]),
	session_exp_date: number([integer(), minValue(0)]),
	privilege: number([integer(), minValue(0)]),
	last_reg_check_id: number([integer(), minValue(0)])
});
export type SysUsers = Output<typeof v_SysUsers>;

export const v_SysUserRegisterLink = object({
	link: string([minLength(1)]),
	exp_date: number([integer(), minValue(0)]),
	privilege: number([integer(), minValue(0)])
});
export type SysUserRegisterLink = Output<typeof v_SysUserRegisterLink>;

export const v_LoginCredentials = object({
	email: string([email()]),
	password: string()
});
export type LoginCredentials = Output<typeof v_LoginCredentials>;

export const v_Teachers = object({
	id: number([integer(), minValue(0)]),
	fullname: string([minLength(1)]),
	picture: string(),
	cv: string(),
	email: optional(string()),
	telephone: optional(string()),
	linktree: optional(string()),
	visible: boolean(),
	online: boolean()
});
export type Teachers = Output<typeof v_Teachers>;

export const v_SimpleTeacher = omit(v_Teachers, ["picture", "cv"]);
export type SimpleTeacher = Output<typeof v_SimpleTeacher>;

export const v_TeacherLocations = object({
	teacher_id: number([integer(), minValue(0)]),
	location_id: number([integer(), minValue(0)])
});
export type TeacherLocations = Output<typeof v_TeacherLocations>;

export const v_TeacherClasses = object({
	teacher_id: number([integer(), minValue(0)]),
	class_id: number([integer(), minValue(0)]),
	priority: number([integer(), minValue(1)])
});
export type TeacherClasses = Output<typeof v_TeacherClasses>;


export const v_ClassType = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)])
});
export type ClassType = Output<typeof v_ClassType>;

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
export type Locations = Output<typeof v_Locations>;

export const v_Instruments = object({
	id: number([integer(), minValue(0)]),
	name: string([minLength(1)]),
	type: union([literal("par"), literal("eur")]),
	isInstrument: union([literal(1), literal(0)])
});
export type Instruments = Output<typeof v_Instruments>;

export const v_TeacherInstruments = object({
	teacher_id: number([integer(), minValue(0)]),
	instrument_id: number([integer(), minValue(0)])
});
export type TeacherInstruments = Output<typeof v_TeacherInstruments>;

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
export type Registrations = Output<typeof v_Registrations>;

export const v_EmailSubscriptions = object({
	email: string([email()]),
	unsubscribe_token: string(),
	unrelated: boolean(),
});
export type EmailSubscriptions = Output<typeof v_EmailSubscriptions>;

export const v_Announcements = object({
	id: number([integer(), minValue(0)]),
	title: string([minLength(1)]),
	content: string(),
	date: number([integer(), minValue(0)]),
	views: number([integer(), minValue(0)]),
});
export type Announcements = Output<typeof v_Announcements>;

export const v_AnnouncementImages = object({
	announcement_id: number([integer(), minValue(0)]),
	name: string(),
	priority: number([integer(), minValue(1)]),
});
export type AnnouncementImages = Output<typeof v_AnnouncementImages>;

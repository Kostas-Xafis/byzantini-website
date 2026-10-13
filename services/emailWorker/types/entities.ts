
export type Insert = { insertId: number; };

export interface Books {
	id: number;
	title: string;
	wholesaler_id: number;
	wholesale_price: number;
	price: number;
	quantity: number;
	sold: number;
};

export interface Payments {
	id: number;
	student_name: string;
	book_id: number;
	amount: number;
	book_amount: number;
	date: number;
	payment_date?: number | undefined;
};

export interface Payoffs {
	id: number;
	wholesaler_id: number;
	amount: number;
};

export interface Wholesalers {
	id: number;
	name: string;
};

export interface SysUsers {
	id: number;
	email: string;
	password: string;
	session_id: string;
	session_exp_date: number;
	privilege: number;
	last_reg_check_id: number;
};

export interface SysUserRegisterLink {
	link: string;
	exp_date: number;
	privilege: number;
};

export interface LoginCredentials {

};

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

export type SimpleTeacher = Omit<Teachers, "picture" | "cv">;

export interface TeacherLocations {
	teacher_id: number;
	location_id: number;
};

export interface TeacherClasses {
	teacher_id: number;
	class_id: number;
	priority: number;
	registration_number?: string | undefined;
};

export interface ClassType {
	id: number;
	name: string;
};

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

export interface Instruments {
	id: number;
	name: string;
	type: "par" | "eur";
	isInstrument: 0 | 1;
};

export interface TeacherInstruments {
	teacher_id: number;
	instrument_id: number;
};

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
	pass: boolean;
	registration_url: string;
};

export interface EmailSubscriptions {
	email: string;
	unsubscribe_token: string;
	unrelated: boolean;
};

export interface Announcements {
	id: number;
	title: string;
	content: string;
	date: number;
	views: number;
	image_counter: number;
};

export interface AnnouncementImages {
	id: number;
	announcement_id: number;
	name: string;
	is_main: boolean;
};

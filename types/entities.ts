import { z } from "zod";

export const z_Books = z.object({
	id: z.number().int().nonnegative(),
	title: z.string().nonempty(),
	wholesaler_id: z.number().nonnegative(),
	wholesale_price: z.number().int().nonnegative(),
	price: z.number().int().nonnegative(),
	quantity: z.number().int().nonnegative(),
	sold: z.number().int().nonnegative()
});

export type Books = z.infer<typeof z_Books>;

export const z_Payments = z.object({
	id: z.number().int().nonnegative(),
	student_name: z.string().nonempty(),
	book_id: z.number().int().nonnegative(),
	amount: z.number().int().nonnegative(),
	date: z.number().int().nonnegative()
});

export type Payments = z.infer<typeof z_Payments>;

export const z_SchoolPayoffs = z.object({
	id: z.number().int().nonnegative(),
	wholesaler_id: z.number().int().nonnegative(),
	amount: z.number().int().nonnegative()
});

export type SchoolPayoffs = z.infer<typeof z_SchoolPayoffs>;

export const z_Wholesalers = z.object({
	id: z.number().int().nonnegative(),
	name: z.string().nonempty()
});

export type Wholesalers = z.infer<typeof z_Wholesalers>;

export const z_SysUsers = z.object({
	id: z.number().int().nonnegative(),
	email: z.string().email(),
	password: z.string().nonempty(),
	session_id: z.string().nonempty(),
	session_exp_date: z.bigint().nonnegative(),
	privilege: z.number().int().nonnegative(),
	last_reg_check_id: z.number().int().nonnegative(),
});

export type SysUsers = z.infer<typeof z_SysUsers>;

export const z_SysUserRegisterLink = z.object({
	link: z.string().nonempty(),
	exp_date: z.bigint().nonnegative(),
	privilege: z.number().int().nonnegative()
});

export type SysUserRegisterLink = z.infer<typeof z_SysUserRegisterLink>;

export const z_Teachers = z.object({
	id: z.number().int().nonnegative(),
	fullname: z.string().nonempty(),
	email: z.string().email(),
	cellphone: z.string().nonempty(),
	picture: z.string(), // Unique picture id
	cv: z.string(), // Unique id for the pdf or whatever file
	priority: z.number().int().nonnegative(),
	instruments: z.string().max(400),
});

export type Teachers = z.infer<typeof z_Teachers>;

export const z_SimpleTeacher = z_Teachers.omit({ picture: true, cv: true });

export type SimpleTeacher = z.infer<typeof z_SimpleTeacher>;


export const z_TeacherLocations = z.object({
	teacher_id: z.number().int().nonnegative(),
	location_id: z.number().int().nonnegative()
});

export type TeacherLocations = z.infer<typeof z_TeacherLocations>;


export const z_TeacherClasses = z.object({
	teacher_id: z.number().int().nonnegative(),
	class_id: z.number().int().nonnegative()
});

export type TeacherClasses = z.infer<typeof z_TeacherClasses>;

export const z_ClassType = z.object({
	id: z.number().int().nonnegative(),
	name: z.string().nonempty()
});

export type ClassType = z.infer<typeof z_ClassType>;

export const z_Locations = z.object({
	id: z.number().int().nonnegative(),
	name: z.string(),
	address: z.string(),
	areacode: z.number().int().nonnegative(),
	municipality: z.string(),
	email: z.string().email(),
	telephones: z.string(),
	priority: z.number().int().nonnegative(),
	image: z.string(),
	map: z.string(),
	link: z.string().optional()
});

export type Locations = z.infer<typeof z_Locations>;

export const z_Registrations = z.object({
	id: z.number().int().nonnegative(),
	last_name: z.string(),
	first_name: z.string(),
	am: z.string(),
	father_name: z.string(),
	birth_year: z.number(),
	road: z.string(),
	number: z.number().int().nonnegative(),
	tk: z.number().int().nonnegative(),
	region: z.string(),
	telephone: z.string(),
	cellphone: z.string(),
	email: z.string(),
	registration_year: z.string(),
	class_year: z.string(),
	teacher_id: z.number().int().nonnegative(),
	class_id: z.number().int().nonnegative(),
	date: z.number().int().nonnegative()
});

export type Registrations = z.infer<typeof z_Registrations>;

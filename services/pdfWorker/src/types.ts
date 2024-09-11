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
};


export type Coords = { x: number, y: number; };

export type TemplateCoords = {
	am: Coords,
	lastName: Coords,
	firstName: Coords,
	fathersName: Coords,
	road: Coords,
	number: Coords,
	tk: Coords,
	region: Coords,
	birthDate: Coords,
	telephone: Coords,
	cellphone: Coords,
	email: Coords,
	registrationYear: Coords,
	classYear: Coords,
	teachersName: Coords,
	dateDD: Coords,
	dateMM: Coords,
	dateYYYY: Coords,
	year1: Coords,
	year2: Coords,
	instrumentPar: Coords,
	instrumentEur: Coords,
	instrumentLarge: Coords,
	signatureByz: Coords,
	signatureEur: Coords,
};

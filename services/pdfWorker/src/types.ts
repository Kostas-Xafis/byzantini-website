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

export type EndpointResponse<T = string> = {
	res: T extends {}
	? T extends string ? {
		type: "message";
		message: string;
	}
	: {
		type: "data";
		data: T;
	}
	: {
		type: "message";
		message: string;
	};
};
export type EndpointResponseError = {
	res: {
		type: "error";
		error: any;
	};
};

export type PDFRegstration = {
	url: string;
	student: Registrations;
	teachersName: string;
	instrument?: string;
};

type PDFRequestType = "registration" | "toImage";
export type PDFRequest<Type extends PDFRequestType = "registration"> = Type extends "registration" ? {
	type: "registration",
	request: {
		isMultiple: false;
		data: PDFRegstration;
	} | {
		isMultiple: true;
		data: PDFRegstration[];
	};
} : {
	type: "toImage",
	request: {
		pages: number[];
		url: string;
	};
};

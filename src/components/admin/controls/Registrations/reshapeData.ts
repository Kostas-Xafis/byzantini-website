import { createMemo, createSignal } from "solid-js";
import { API, type APIResponse } from "@lib/routes/index.client";
import type { Instruments, Registrations, Teachers } from "@_types/entities";
import { ALL_COLUMNS, cellMatches, rowMatchesAny } from "../../table/searchMatch";
import type { SearchColumn, SearchSetter } from "../../SearchTable.solid";
import { toggleCheckboxes } from "../../table/Row.solid";
import type { ColumnType } from "../../table/Table.solid";

// Positional index of each `columns` key in the table row array. Row order in
// `registrationsToTable` MUST match the `columns` map below (exactly one entry
// per column, in order). The search filter indexes into those rows, so it must
// use this same order — never `Object.keys(registration)`, whose order follows
// the zod response schema (id, am, amka, first_name, ...) and not the table.
const columnOrder = [
	"id",
	"am",
	"last_name",
	"first_name",
	"fathers_name",
	"birth_date",
	"road",
	"number",
	"tk",
	"region",
	"telephone",
	"cellphone",
	"email",
	"registration_year",
	"class_year",
	"class_id",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"amka",
	"pass",
	"registration_url",
] as const;

const classNames = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"];

/** Row index of a column (by its data key, e.g. "teacher_id"); -1 when unknown. */
export const columnIndexOf = (columnName: string) => (columnOrder as readonly string[]).indexOf(columnName);

const registrationsToTable = (registrations: Registrations[], teachers: Teachers[], instruments: Instruments[]) => {
	return registrations.map((reg) => {
		return [
			reg.id,
			reg.am,
			reg.last_name,
			reg.first_name,
			reg.fathers_name,
			reg.birth_date,
			reg.road,
			reg.number,
			reg.tk,
			reg.region,
			reg.telephone,
			reg.cellphone,
			reg.email,
			reg.registration_year,
			reg.class_year,
			classNames[reg.class_id],
			teachers.find((t) => t.id === reg.teacher_id)?.fullname,
			instruments.find((i) => i.id === reg.instrument_id)?.name,
			reg.date,
			reg.payment_amount || null,
			reg.total_payment || null,
			reg.payment_date,
			reg.amka,
			reg.pass,
			location.origin + "/eggrafes/?regid=" + reg.registration_url,
		];
	});
};

export const columns: ColumnType<Registrations> = {
	id: { type: "number", name: "Id" },
	am: { type: "number", name: "Αριθμός Μητρώου", size: 7 },
	last_name: { type: "string", name: "Επώνυμο", size: 15 },
	first_name: { type: "string", name: "Όνομα", size: 15 },
	fathers_name: { type: "string", name: "Πατρώνυμο", size: 15 },
	birth_date: { type: "date", name: "Ημερομηνία Γέννησης", size: 12 },
	road: { type: "string", name: "Οδός", size: 15 },
	number: { type: "number", name: "Αριθμός" },
	tk: { type: "number", name: "Τ.Κ." },
	region: { type: "string", name: "Δήμος/Περιοχή", size: 15 },
	telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
	cellphone: { type: "string", name: "Κινητό", size: 12 },
	email: { type: "string", name: "Email", size: 20 },
	registration_year: { type: "string", name: "Σχολικό Έτος", size: 10 },
	class_year: { type: "string", name: "Έτος Φοίτησης", size: 12 },
	class_id: { type: "string", name: "Τάξη", size: 15 },
	teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
	instrument_id: { type: "string", name: "Όργανο", size: 12 },
	date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
	payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
	total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
	amka: { type: "string", name: "ΑΜΚΑ", size: 15 },
	pass: { type: "boolean", name: "Προάχθει", size: 8 },
	registration_url: { type: "link", name: "URL Εγγραφής", size: 12 },
};

export const searchColumns: SearchColumn[] = [
	{ columnName: "last_name", name: "Επώνυμο", type: "string" },
	{ columnName: "first_name", name: "Όνομα", type: "string" },
	{ columnName: "am", name: "ΑΜ", type: "string" },
	{ columnName: "amka", name: "ΑΜΚΑ", type: "string" },
	{ columnName: "teacher_id", name: "Καθηγητής", type: "string" },
	{ columnName: "telephone", name: "Τηλέφωνο", type: "string" },
	{ columnName: "cellphone", name: "Κινητό", type: "string" },
	{ columnName: "email", name: "Email", type: "string" },
	{ columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
	{ columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
	{ columnName: "class_id", name: "Τάξη", type: "string" },
	{ columnName: "instrument_id", name: "Όργανο", type: "string" },
];

// Column types in row order (matches `columns` / `columnOrder` above) so the
// shared matchers know how to interpret each cell.
const searchColumnTypes = Object.values(columns).map(({ type }) => type);

export const reshapeData = function (store: Partial<APIResponse>, searchQuery: SearchSetter) {
	const [dataLength, setDataLength] = createSignal(0);

	return [
		createMemo(() => {
			const registrations = store[API.Registrations.get];
			const teachers = store[API.Teachers.getByFullnames];
			const instruments = store[API.Instruments.get];
			if (!registrations || !teachers || !instruments) return [];
			const { columnName, value, type } = searchQuery;
			if (!columnName || !value || !type) {
				toggleCheckboxes(false);
				setDataLength(registrations.length);
				return registrationsToTable(registrations, teachers, instruments);
			}
			let searchRows = registrationsToTable(registrations, teachers, instruments);
			const query = String(value).trim();
			const columnIndex = columnIndexOf(columnName as string);
			if (query) {
				if (columnName === ALL_COLUMNS) {
					searchRows = searchRows.filter((row) => rowMatchesAny(row, searchColumnTypes, query));
				} else if (columnIndex >= 0) {
					searchRows = searchRows.filter((row) => cellMatches(row[columnIndex], searchColumnTypes[columnIndex], query));
				}
			}
			toggleCheckboxes(false);
			setDataLength(searchRows.length);
			return searchRows;
		}),
		dataLength,
	] as const;
};

import { createMemo, createSignal } from "solid-js";
import { API, type APIResponse } from "@lib/routes/index.client";
import type { Instruments, JoinedEnrollments, Teachers } from "@_types/entities";
import { ALL_COLUMNS, cellMatches, rowMatchesAny } from "../../table/searchMatch";
import type { SearchColumn, SearchSetter } from "../../SearchTable.solid";
import { toggleCheckboxes } from "../../table/Row.solid";
import type { ColumnType } from "../../table/Table.solid";

// Positional index of each `columns` key in the table row array. Row order in
// `enrollmentsToTable` MUST match the `columns` map below (exactly one entry
// per column, in order). The search filter indexes into those rows, so it must
// use this same order — never `Object.keys(...)`, whose order follows the zod
// response schema and not the table.
//
// `id` stays first: the shared `Row` component reads the row id from index 0.
//
// Column scope: the table lists ENROLLMENTS (one row per pupil / year / class /
// instrument), so every enrollment field is shown. Of the pupil's own fields
// only the identity is kept — ΑΜ, επώνυμο, όνομα, πατρώνυμο — because the rest
// (address, phones, email, ΑΜΚΑ, birth date) duplicates what the Μαθητολόγιο
// record view already shows.
//
// `registration_year` is deliberately absent: the page is scoped to one school
// year by the picker at the bottom, so every row would repeat the same value.
const columnOrder = [
	"id",
	"am",
	"last_name",
	"first_name",
	"fathers_name",
	"class_year",
	"class_id",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
] as const;

const classNames = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"];

/** Row index of a column (by its data key, e.g. "teacher_id"); -1 when unknown. */
export const columnIndexOf = (columnName: string) => (columnOrder as readonly string[]).indexOf(columnName);

const enrollmentsToTable = (enrollments: JoinedEnrollments[], teachers: Teachers[], instruments: Instruments[]) => {
	return enrollments.map((enrollment) => {
		return [
			enrollment.id,
			enrollment.am,
			enrollment.last_name,
			enrollment.first_name,
			enrollment.fathers_name,
			enrollment.class_year,
			classNames[enrollment.class_id],
			teachers.find((teacher) => teacher.id === enrollment.teacher_id)?.fullname,
			instruments.find((instrument) => instrument.id === enrollment.instrument_id)?.name,
			enrollment.date,
			enrollment.payment_amount || null,
			enrollment.total_payment || null,
			enrollment.payment_date,
			enrollment.pass,
		];
	});
};

export const columns: Partial<ColumnType<JoinedEnrollments>> = {
	id: { type: "number", name: "Id" },
	am: { type: "string", name: "Αριθμός Μητρώου", size: 10 },
	last_name: { type: "string", name: "Επώνυμο", size: 18 },
	first_name: { type: "string", name: "Όνομα", size: 18 },
	fathers_name: { type: "string", name: "Πατρώνυμο", size: 18 },
	class_year: { type: "string", name: "Έτος Φοίτησης", size: 12 },
	class_id: { type: "string", name: "Μουσική", size: 15 },
	teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
	instrument_id: { type: "string", name: "Όργανο", size: 12 },
	date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
	payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
	total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
	pass: { type: "boolean", name: "Προάχθει", size: 8 },
};

// Σχολικό Έτος is not in the table (the year picker at the bottom already scopes
// the page), but it stays searchable: filtering by a year inside the current
// selection is still meaningful.
export const searchColumns: SearchColumn[] = [
	{ columnName: "last_name", name: "Επώνυμο", type: "string" },
	{ columnName: "first_name", name: "Όνομα", type: "string" },
	{ columnName: "fathers_name", name: "Πατρώνυμο", type: "string" },
	{ columnName: "am", name: "ΑΜ", type: "string" },
	{ columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
	{ columnName: "class_id", name: "Μουσική", type: "string" },
	{ columnName: "teacher_id", name: "Καθηγητής", type: "string" },
	{ columnName: "instrument_id", name: "Όργανο", type: "string" },
	{ columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
	{ columnName: "payment_date", name: "Ημερομηνία Πληρωμής", type: "date" },
	{ columnName: "pass", name: "Προάχθει", type: "boolean" },
];

// Column types in row order (matches `columns` / `columnOrder` above) so the
// shared matchers know how to interpret each cell.
const searchColumnTypes = Object.values(columns).map(({ type }) => type);

export const reshapeData = function (store: Partial<APIResponse>, searchQuery: SearchSetter) {
	const [dataLength, setDataLength] = createSignal(0);

	return [
		createMemo(() => {
			const enrollments = store[API.Pupils.getEnrollmentsByYear];
			if (!enrollments) return [];
			const teachers = store[API.Teachers.getByFullnames] ?? [];
			const instruments = store[API.Instruments.get] ?? [];
			const { columnName, value, type } = searchQuery;
			if (!columnName || !value || !type) {
				toggleCheckboxes(false);
				setDataLength(enrollments.length);
				return enrollmentsToTable(enrollments, teachers, instruments);
			}
			let searchRows = enrollmentsToTable(enrollments, teachers, instruments);
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

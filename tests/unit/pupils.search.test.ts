/**
 * Unit tests for lib/pupils/search.ts — the Μαθητολόγιο ranking (one chosen field, ΑΜ by default).
 */
import { enrolledPupilIds, rankPupils, scoreName, tokenizeQuery, type PupilSearchField, type SearchablePupil } from "@lib/pupils/search";
import { describe, expect, test } from "bun:test";

const pupil = (fields: Partial<SearchablePupil> & Pick<SearchablePupil, "last_name" | "first_name">): SearchablePupil => ({
	am: null,
	orphan_code: "",
	split_from_am: null,
	amka: "",
	telephone: "",
	cellphone: "",
	email: "",
	...fields,
});

const peleki = pupil({ am: 706, last_name: "Πελέκη", first_name: "Αικατερίνη", amka: "27037202341", cellphone: "697 349-0962", email: "K.Peleki@example.com" });
const papadopoulos = pupil({ am: 7061, last_name: "Παπαδόπουλος", first_name: "Γιώργος", amka: "27031234567", telephone: "210 2810706" });
const papadaki = pupil({ am: 1287, last_name: "ΠΑΠΑΔΑΚΗ", first_name: "ΕΛΕΝΗ", email: "papadaki@example.com" });
const elenis = pupil({ am: 70, last_name: "Γεωργίου-Ελένη", first_name: "Μαρία" });
const orphan = pupil({ orphan_code: "000-Ο1", last_name: "Νέος", first_name: "Μαθητής" });
const split = pupil({ orphan_code: "111-Σ1", split_from_am: 111, last_name: "Σπλιτ", first_name: "Δοκιμή" });
const all = [peleki, papadopoulos, papadaki, elenis, orphan, split];

const names = (query: string, field: PupilSearchField = "am") => rankPupils(all, query, field).map((row) => row.last_name);

describe("tokenizeQuery", () => {
	test("normalises accents, case and final sigma", () => {
		expect(tokenizeQuery("  Παπαδόπουλος  Γιώργος ")).toEqual(["παπαδοπουλοσ", "γιωργοσ"]);
	});
});

describe("ΑΜ (the default field)", () => {
	test("an exact ΑΜ ranks before the ΑΜ it prefixes", () => {
		expect(names("706")).toEqual(["Πελέκη", "Παπαδόπουλος"]);
	});
	test("a prefix lists every ΑΜ that starts with it, in registry order", () => {
		expect(names("70")).toEqual(["Γεωργίου-Ελένη", "Πελέκη", "Παπαδόπουλος"]);
	});
	test("review codes and the origin of a split row", () => {
		expect(names("000-ο1")).toEqual(["Νέος"]);
		expect(names("111")).toEqual(["Σπλιτ"]);
	});
	test("review codes typed on a Latin keyboard (o / s for Ο / Σ)", () => {
		expect(names("000-O1")).toEqual(["Νέος"]);
		expect(names("111-s1")).toEqual(["Σπλιτ"]);
	});
	test("names and ΑΜΚΑ do not match the ΑΜ field", () => {
		expect(names("παπαδ")).toEqual([]);
		expect(names("27037202341")).toEqual([]);
	});
});

describe("Ονοματεπώνυμο", () => {
	test("accent- and case-insensitive surname prefix", () => {
		expect(names("παπαδ", "name")).toEqual(["ΠΑΠΑΔΑΚΗ", "Παπαδόπουλος"]);
	});
	test("full name in either order, the surname-first reading ranks higher", () => {
		expect(names("Πελέκη Αικατερίνη", "name")).toEqual(["Πελέκη"]);
		expect(names("αικατερινη πελεκη", "name")).toEqual(["Πελέκη"]);
		expect(scoreName(peleki, tokenizeQuery("πελεκη αικ"))).toBeGreaterThan(scoreName(peleki, tokenizeQuery("αικ πελεκη")));
	});
	test("a surname match outranks a first-name match", () => {
		// «Ελένη» is Παπαδάκη's first name and the second part of Γεωργίου-Ελένη's surname
		expect(names("ελενη", "name")).toEqual(["Γεωργίου-Ελένη", "ΠΑΠΑΔΑΚΗ"]);
	});
	test("every word must match something", () => {
		expect(names("παπαδ ζζζ", "name")).toEqual([]);
	});
	test("words match from the start only: no mid-word hits", () => {
		expect(names("λεκη", "name")).toEqual([]);
	});
	test("a hyphenated surname matches typed with or without its hyphen", () => {
		expect(names("Γεωργίου-Ελένη", "name")).toEqual(["Γεωργίου-Ελένη"]);
		expect(names("γεωργιου - ελενη μαρια", "name")).toEqual(["Γεωργίου-Ελένη"]);
		expect(names("γεωργιου ελενη", "name")).toEqual(["Γεωργίου-Ελένη"]);
	});
	test("an ΑΜ does not match the name field", () => {
		expect(names("706", "name")).toEqual([]);
	});
});

describe("ΑΜΚΑ, τηλέφωνο, email", () => {
	test("ΑΜΚΑ: exact first, then prefix", () => {
		expect(names("27037202341", "amka")).toEqual(["Πελέκη"]);
		expect(names("2703", "amka")).toEqual(["Παπαδόπουλος", "Πελέκη"]);
		expect(names("2703 1234567", "amka")).toEqual(["Παπαδόπουλος"]);
	});
	test("phone: the digits anywhere in the landline or the mobile, separators ignored", () => {
		expect(names("6973490962", "phone")).toEqual(["Πελέκη"]);
		expect(names("349 0962", "phone")).toEqual(["Πελέκη"]);
		expect(names("0706", "phone")).toEqual(["Παπαδόπουλος"]);
		expect(names("+30 697 349 0962", "phone")).toEqual(["Πελέκη"]);
		expect(names("0030 6973490962", "phone")).toEqual(["Πελέκη"]);
		expect(names("αβγ", "phone")).toEqual([]);
	});
	test("email: part of the address, case-insensitive", () => {
		expect(names("peleki", "email")).toEqual(["Πελέκη"]);
		expect(names("@EXAMPLE.com", "email")).toEqual(["ΠΑΠΑΔΑΚΗ", "Πελέκη"]);
	});
});

describe("enrolledPupilIds", () => {
	const enrollments = [
		{ pupil_id: 1, teacher_id: 10, instrument_id: 100 },
		{ pupil_id: 2, teacher_id: 11, instrument_id: 100 },
		{ pupil_id: 3, teacher_id: 11, instrument_id: 101 },
	];
	const teachers = [
		{ id: 10, name: "Παπαδόπουλος Ιωάννης" },
		{ id: 11, name: "Γεωργίου Μαρία" },
	];
	const instruments = [
		{ id: 100, name: "Βιολί" },
		{ id: 101, name: "Λαούτο" },
	];
	test("a teacher's name matches like a pupil's (word prefixes, any order)", () => {
		expect(enrolledPupilIds("teacher", "μαρια γεωργ", enrollments, teachers)).toEqual(new Set([2, 3]));
		expect(enrolledPupilIds("teacher", "ιωαν", enrollments, teachers)).toEqual(new Set([1]));
	});
	test("instrument", () => {
		expect(enrolledPupilIds("instrument", "βιολι", enrollments, instruments)).toEqual(new Set([1, 2]));
		expect(enrolledPupilIds("instrument", "πιανο", enrollments, instruments)).toEqual(new Set());
	});
	test("real names: titles, brackets, ' - ', diaeresis and capitals match however they are typed", () => {
		const real = [
			{ id: 1, name: "π. Θεόδωρος Παπαγιάννης" },
			{ id: 2, name: "π.  Ιωάννης Μάνος" },
			{ id: 3, name: "Ιωάννης Κακλιδάκης (Κακλής)" },
			{ id: 4, name: "ΔΗΜΗΤΡΙΟΣ ΦΩΤΟΠΟΥΛΟΣ" },
			{ id: 5, name: "Φωνητική - Ορθοφωνία" },
			{ id: 6, name: "Σύριγγα Πανός (μουσκάλι)" },
			{ id: 7, name: "Λαϊκή κιθάρα" },
		];
		const realEnrollments = real.map((entry) => ({ pupil_id: entry.id, teacher_id: entry.id, instrument_id: entry.id }));
		const found = (query: string) => [...(enrolledPupilIds("teacher", query, realEnrollments, real) ?? [])];
		expect(found("π. Θεόδωρος Παπαγιάννης")).toEqual([1]);
		expect(found("π.Θεόδωρος")).toEqual([1]);
		expect(found("Παπαγιάννης")).toEqual([1]);
		expect(found("π. Ιωάννης Μάνος")).toEqual([2]);
		expect(found("κακλης")).toEqual([3]);
		expect(found("Ιωάννης Κακλιδάκης (Κακλής)")).toEqual([3]);
		expect(found("Δημήτριος Φωτόπουλος")).toEqual([4]);
		expect(found("Φωνητική - Ορθοφωνία")).toEqual([5]);
		expect(found("φωνητικη-ορθοφωνια")).toEqual([5]);
		expect(found("μουσκαλι")).toEqual([6]);
		expect(found("ΛΑΪΚΗ")).toEqual([7]);
		expect(found("λαικη κιθαρα")).toEqual([7]);
	});
	test("a whole name keeps to that name; a part of one still matches every name it starts a word of", () => {
		const lutes = [
			{ id: 2, name: "Λαούτο" },
			{ id: 3, name: "Πολίτικο Λαούτο" },
		];
		const lute = [
			{ pupil_id: 1, teacher_id: 0, instrument_id: 2 },
			{ pupil_id: 2, teacher_id: 0, instrument_id: 3 },
		];
		expect(enrolledPupilIds("instrument", "Λαούτο", lute, lutes)).toEqual(new Set([1]));
		expect(enrolledPupilIds("instrument", "λαουτ", lute, lutes)).toEqual(new Set([1, 2]));
		// the same teacher entered twice, in both word orders
		const twice = [
			{ id: 113, name: "Λεωνίδας Ραμπαούνης" },
			{ id: 114, name: "Ραμπαούνης Λεωνίδας" },
		];
		const taught = [
			{ pupil_id: 1, teacher_id: 113, instrument_id: 0 },
			{ pupil_id: 2, teacher_id: 114, instrument_id: 0 },
		];
		expect(enrolledPupilIds("teacher", "Ραμπαούνης Λεωνίδας", taught, twice)).toEqual(new Set([1, 2]));
	});
	test("an empty query is no filter", () => {
		expect(enrolledPupilIds("teacher", "  ", enrollments, teachers)).toBeNull();
	});
});

describe("empty query", () => {
	test("lists everyone alphabetically, whatever the field", () => {
		expect(rankPupils(all, "  ")).toHaveLength(all.length);
		expect(rankPupils(all, "")[0]!.last_name).toBe("Γεωργίου-Ελένη");
		expect(rankPupils(all, "", "email")).toHaveLength(all.length);
	});
});

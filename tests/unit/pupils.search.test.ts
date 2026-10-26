/**
 * Unit tests for lib/pupils/search.ts — the Μαθητολόγιο ranking (ΑΜ or name only).
 */
import { rankPupils, scorePupil, tokenizeQuery, type SearchablePupil } from "@lib/pupils/search";
import { describe, expect, test } from "bun:test";

const pupil = (fields: Partial<SearchablePupil> & Pick<SearchablePupil, "last_name" | "first_name">): SearchablePupil => ({
	am: null,
	orphan_code: "",
	split_from_am: null,
	amka: "",
	...fields,
});

const peleki = pupil({ am: 706, last_name: "Πελέκη", first_name: "Αικατερίνη", amka: "27037202341" });
const papadopoulos = pupil({ am: 7061, last_name: "Παπαδόπουλος", first_name: "Γιώργος" });
const papadaki = pupil({ am: 1287, last_name: "ΠΑΠΑΔΑΚΗ", first_name: "ΕΛΕΝΗ" });
const elenis = pupil({ am: 70, last_name: "Γεωργίου-Ελένη", first_name: "Μαρία" });
const orphan = pupil({ orphan_code: "000-Ο1", last_name: "Νέος", first_name: "Μαθητής" });
const split = pupil({ orphan_code: "111-Σ1", split_from_am: 111, last_name: "Σπλιτ", first_name: "Δοκιμή" });
const all = [peleki, papadopoulos, papadaki, elenis, orphan, split];

const names = (query: string) => rankPupils(all, query).map((row) => row.last_name);

describe("tokenizeQuery", () => {
	test("normalises accents, case and final sigma", () => {
		expect(tokenizeQuery("  Παπαδόπουλος  Γιώργος ")).toEqual(["παπαδοπουλοσ", "γιωργοσ"]);
	});
});

describe("ΑΜ", () => {
	test("an exact ΑΜ ranks before the ΑΜ it prefixes", () => {
		expect(names("706")).toEqual(["Πελέκη", "Παπαδόπουλος"]);
	});
	test("a prefix lists every ΑΜ that starts with it, in registry order", () => {
		expect(names("70")).toEqual(["Γεωργίου-Ελένη", "Πελέκη", "Παπαδόπουλος"]);
	});
	test("an exact 11-digit ΑΜΚΑ finds the pupil, a fragment of it does not", () => {
		expect(names("27037202341")).toEqual(["Πελέκη"]);
		expect(names("2703720")).toEqual([]);
	});
	test("review codes and the origin of a split row", () => {
		expect(names("000-ο1")).toEqual(["Νέος"]);
		expect(names("111")).toEqual(["Σπλιτ"]);
	});
});

describe("names", () => {
	test("accent- and case-insensitive surname prefix", () => {
		expect(names("παπαδ")).toEqual(["ΠΑΠΑΔΑΚΗ", "Παπαδόπουλος"]);
	});
	test("full name in either order, the surname-first reading ranks higher", () => {
		expect(names("Πελέκη Αικατερίνη")).toEqual(["Πελέκη"]);
		expect(names("αικατερινη πελεκη")).toEqual(["Πελέκη"]);
		expect(scorePupil(peleki, tokenizeQuery("πελεκη αικ"))).toBeGreaterThan(scorePupil(peleki, tokenizeQuery("αικ πελεκη")));
	});
	test("a surname match outranks a first-name match", () => {
		// «Ελένη» is Παπαδάκη's first name and the second part of Γεωργίου-Ελένη's surname
		expect(names("ελενη")).toEqual(["Γεωργίου-Ελένη", "ΠΑΠΑΔΑΚΗ"]);
	});
	test("every word must match something", () => {
		expect(names("παπαδ ζζζ")).toEqual([]);
	});
	test("words match from the start only: no mid-word hits", () => {
		expect(names("λεκη")).toEqual([]);
	});
});

describe("empty query", () => {
	test("lists everyone alphabetically", () => {
		expect(rankPupils(all, "  ")).toHaveLength(all.length);
		expect(rankPupils(all, "")[0]!.last_name).toBe("Γεωργίου-Ελένη");
	});
});

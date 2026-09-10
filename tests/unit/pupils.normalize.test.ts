/**
 * Unit tests for lib/pupils/normalize.ts.
 *
 * Every fixture below is a real value taken from the 1514-row local snapshot
 * (see docs/PUPILS_MIGRATION.md §2), so these tests double as a specification
 * of how the backfill will read the legacy data.
 *
 * Pure functions — no dev server, no DB, no env file required.
 */
import { expect, test } from "bun:test";
import {
	canonicalClassYear,
	collapseWhitespace,
	needsClassYearReview,
	normalizeAmka,
	normalizeEmail,
	normalizeKey,
	normalizePhone,
	normalizeText,
	parseAm,
	personIdentityKeys,
	personNameKey,
	stripDiacritics,
} from "@lib/pupils/normalize";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

test("stripDiacritics folds Greek accents and leaves casing/sigma alone", () => {
	expect(stripDiacritics("Ψύλλιας")).toBe("Ψυλλιας");
	expect(stripDiacritics("Γεωργίου")).toBe("Γεωργιου");
	expect(stripDiacritics("Διπλώματος")).toBe("Διπλωματος");
	expect(stripDiacritics("ΠΑΛΑΙΟΛΟΓΟΣ")).toBe("ΠΑΛΑΙΟΛΟΓΟΣ");
	// display text must stay readable: the final sigma is NOT rewritten here
	expect(stripDiacritics("Παλαιολόγος")).toBe("Παλαιολογος");
});

test("collapseWhitespace collapses runs and trims", () => {
	expect(collapseWhitespace("  Δαλιάνης   Νικόλαος  ")).toBe("Δαλιάνης Νικόλαος");
	expect(collapseWhitespace("Α'  Έτος\u00a0Διπλώματος")).toBe("Α' Έτος Διπλώματος");
	expect(collapseWhitespace("")).toBe("");
});

test("normalizeText keeps casing/accents but fixes spacing", () => {
	expect(normalizeText("Μπερδελής  Γεώργιος ")).toBe("Μπερδελής Γεώργιος");
	expect(normalizeText(null)).toBe("");
	expect(normalizeText(undefined)).toBe("");
});

test("normalizeKey is accent/case/space insensitive and folds final sigma", () => {
	// the two spellings of the same pupil in the data
	expect(normalizeKey("Ψύλλιας Σταύρος")).toBe(normalizeKey("Ψυλλιας Σταυρος"));
	expect(normalizeKey("ΔΑΛΙΑΝΗΣ ΝΙΚΟΛΑΟΣ")).toBe(normalizeKey("Δαλιάνης Νικόλαος"));
	expect(normalizeKey("ΠΑΛΑΙΟΛΟΓΟΣ")).toBe(normalizeKey("Παλαιολόγος"));
	// hyphen spacing differs but the words are the same; whitespace around the
	// hyphen is collapsed but not invented, so the two spellings differ only in
	// spacing and are matched by the ΑΜΚΑ/phone/email keys instead
	expect(normalizeKey("Γεωργίου Σωτήρης -Ταξιάρχης")).toBe("γεωργιου σωτηρησ -ταξιαρχησ");
	expect(normalizeKey("Γεωργίου  Σωτήρης   -   Ταξιάρχης")).toBe("γεωργιου σωτηρησ - ταξιαρχησ");
	// 'Σωτήριος' vs 'Σωτήρης' is a different word — the key must NOT pretend they
	// are equal; those rows are matched via ΑΜΚΑ/phone/email instead.
	expect(normalizeKey("Γεωργίου Σωτήριος - Ταξιάρχης")).not.toBe(normalizeKey("Γεωργίου Σωτήρης - Ταξιάρχης"));
});

// ---------------------------------------------------------------------------
// ΑΜ parsing
// ---------------------------------------------------------------------------

test("parseAm accepts the real registry numbers", () => {
	expect(parseAm("706")).toMatchObject({ am: 706, kind: "valid", reason: "ok" });
	expect(parseAm("85")).toMatchObject({ am: 85, kind: "valid" });
	expect(parseAm("1000")).toMatchObject({ am: 1000, kind: "valid" });
	expect(parseAm(1234)).toMatchObject({ am: 1234, kind: "valid" });
});

test("parseAm trims padding and decoration", () => {
	// '1287   ' (trailing spaces), '761 ' , '΄1158' (Greek keraia prefix)
	expect(parseAm("1287   ")).toMatchObject({ am: 1287, kind: "valid" });
	expect(parseAm("761 ")).toMatchObject({ am: 761, kind: "valid" });
	expect(parseAm("΄1158")).toMatchObject({ am: 1158, kind: "valid" });
	expect(parseAm(" 706 ")).toMatchObject({ am: 706, kind: "valid" });
});

test("parseAm classifies the placeholders as orphans", () => {
	expect(parseAm("000")).toMatchObject({ am: null, kind: "orphan", reason: "zero", digits: "000" });
	expect(parseAm("0")).toMatchObject({ am: null, kind: "orphan", reason: "zero" });
	expect(parseAm("000 - Αναμονή")).toMatchObject({ am: null, kind: "orphan", reason: "waiting", digits: "000" });
	expect(parseAm("999 - Αναμονή")).toMatchObject({ am: null, kind: "orphan", reason: "waiting", digits: "999" });
});

test("parseAm flags implausible ΑΜ values instead of guessing", () => {
	// 7 and 9 digits in a column that should hold 3-4
	expect(parseAm("3592307")).toMatchObject({ am: null, kind: "invalid", reason: "too_long" });
	expect(parseAm("200488938")).toMatchObject({ am: null, kind: "invalid", reason: "too_long" });
	expect(parseAm("abc")).toMatchObject({ am: null, kind: "invalid", reason: "non_numeric" });
	expect(parseAm("")).toMatchObject({ am: null, kind: "invalid", reason: "empty" });
	expect(parseAm(null)).toMatchObject({ am: null, kind: "invalid", reason: "empty" });
});

test("parseAm keeps the raw value for the report", () => {
	expect(parseAm("000 - Αναμονή").raw).toBe("000 - Αναμονή");
	expect(parseAm(" 1287  ").raw).toBe(" 1287  ");
});

// ---------------------------------------------------------------------------
// ΑΜΚΑ / phones / email
// ---------------------------------------------------------------------------

test("normalizeAmka treats blanks and the fake all-zero value as unknown", () => {
	expect(normalizeAmka("")).toBe("");
	expect(normalizeAmka(null)).toBe("");
	expect(normalizeAmka("00000000000")).toBe("");
	expect(normalizeAmka("01076702305")).toBe("01076702305");
	expect(normalizeAmka(" 01076702305 ")).toBe("01076702305");
});

test("normalizePhone strips formatting and the Greek country code", () => {
	expect(normalizePhone("6973490962")).toBe("6973490962");
	expect(normalizePhone("+30 697 349 0962")).toBe("6973490962");
	expect(normalizePhone("0030 2106131194")).toBe("2106131194");
	expect(normalizePhone("210-6131194")).toBe("2106131194");
});

test("normalizePhone ignores the legacy placeholder and short values", () => {
	expect(normalizePhone("-")).toBe("");
	expect(normalizePhone("")).toBe("");
	expect(normalizePhone(null)).toBe("");
	expect(normalizePhone("12345")).toBe("");
});

test("normalizeEmail lowercases and rejects junk", () => {
	expect(normalizeEmail("  GXophakes@Gmail.com ")).toBe("gxophakes@gmail.com");
	expect(normalizeEmail("")).toBe("");
	expect(normalizeEmail("-")).toBe("");
});

// ---------------------------------------------------------------------------
// Person identity
// ---------------------------------------------------------------------------

test("personNameKey ignores spelling differences", () => {
	expect(personNameKey({ last_name: "Ψύλλιας", first_name: "Σταύρος" })).toBe(
		personNameKey({ last_name: "Ψυλλιας", first_name: "Σταυρος" }),
	);
	expect(personNameKey({ last_name: "Δαλιάνης", first_name: "Νικόλαος" })).not.toBe(
		personNameKey({ last_name: "Δαλιάνης", first_name: "Χρήστος" }),
	);
	expect(personNameKey({})).toBe("");
});

test("personIdentityKeys prefers ΑΜΚΑ, then cellphone, then email", () => {
	const keys = personIdentityKeys({
		amka: "01076702305",
		cellphone: "6973490962",
		telephone: "2106131194",
		email: "a@b.gr",
	});
	expect(keys.map((k) => k.type)).toEqual(["amka", "cellphone", "email"]);
});

test("personIdentityKeys falls back to landline only without a cellphone", () => {
	// families share landlines, so telephone is only used when nothing else exists
	expect(personIdentityKeys({ telephone: "2106131194" }).map((k) => k.type)).toEqual(["telephone"]);
	expect(personIdentityKeys({ cellphone: "6973490962", telephone: "2106131194" }).map((k) => k.type)).toEqual(["cellphone"]);
});

test("personIdentityKeys skips unusable values", () => {
	expect(personIdentityKeys({ amka: "00000000000", telephone: "-", email: "-" })).toEqual([]);
});

// ---------------------------------------------------------------------------
// Class year
// ---------------------------------------------------------------------------

test("canonicalClassYear maps every spelling observed in the data", () => {
	const cases: Array<[string, string]> = [
		["Α' Ετος", "Α' Ετος"],
		["Α΄ έτος", "Α' Ετος"],
		["Β' Ετος", "Β' Ετος"],
		["Γ' Ετος", "Γ' Ετος"],
		["Δ' Ετος", "Δ' Ετος"],
		["Δ΄ έτος", "Δ' Ετος"],
		["Ε' Ετος", "Ε' Ετος"],
		["Α' Προκαταρκτική", "Α' Προκαταρκτική"],
		["Α΄ Προκαταρκτική", "Α' Προκαταρκτική"],
		["Προκαταρκτική", "Α' Προκαταρκτική"],
		["Α' Κατωτέρα", "Α' Κατωτέρα"],
		["Β' Κατωτέρα", "Β' Κατωτέρα"],
		["Α' Μέση", "Α' Μέση"],
		["Α΄ Μέση", "Α' Μέση"],
		["Β' Μέση", "Β' Μέση"],
		["Γ' Μέση", "Γ' Μέση"],
		["Α' Ανωτέρα", "Α' Ανωτέρα"],
		["Β' Ανωτέρα", "Β' Ανωτέρα"],
		["Β΄ Ανωτέρα", "Β' Ανωτέρα"],
		["Α' Διπλώματος", "Α' Διπλώματος"],
		["Β' Διπλώματος", "Β' Διπλώματος"],
		["Α' Ετος Διπλώματος", "Α' Ετος Διπλώματος"],
		["Α'  Έτος Διπλώματος", "Α' Ετος Διπλώματος"],
		["Β' Ετος Διπλώματος", "Β' Ετος Διπλώματος"],
		["Υπό Κατάταξη", "Υπό Κατάταξη"],
	];
	for (const [input, expected] of cases) {
		expect(canonicalClassYear(input), `canonicalClassYear(${JSON.stringify(input)})`).toBe(expected);
	}
});

test("canonicalClassYear returns empty for missing values", () => {
	expect(canonicalClassYear("undefined")).toBe("");
	expect(canonicalClassYear("")).toBe("");
	expect(canonicalClassYear(null)).toBe("");
});

test("needsClassYearReview only flags real values that did not map", () => {
	expect(needsClassYearReview("undefined")).toBe(false);
	expect(needsClassYearReview("")).toBe(false);
	expect(needsClassYearReview("Α' Ετος")).toBe(false);
	expect(needsClassYearReview("Ξ' Αγνώστου")).toBe(true);
});

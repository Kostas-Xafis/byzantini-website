/**
 * Unit tests for lib/pupils/normalize.ts.
 *
 * Every fixture below is a real value taken from the legacy register, so these
 * tests double as a specification of how the pupil routes parse the ΑΜ and
 * compare names/phones.
 *
 * Pure functions — no dev server, no DB, no env file required.
 */
import { expect, test } from "bun:test";
import { collapseWhitespace, normalizeKey, normalizePhone, normalizeText, parseAm, stripDiacritics } from "@lib/pupils/normalize";

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

test("parseAm keeps the raw value for the review note", () => {
	expect(parseAm("000 - Αναμονή").raw).toBe("000 - Αναμονή");
	expect(parseAm(" 1287  ").raw).toBe(" 1287  ");
});

test("parseAm treats a secretary's note as unusable, never mining a number out of it", () => {
	// The secretaries mark the rows they could not resolve. Taking the digits out
	// of 'ΛΑΘΟΣ 1085' would hand the pupil a real-looking ΑΜ and hide the row from
	// the review list, so a value containing letters is never a registry number.
	for (const value of ["ΛΑΘΟΣ 1085", "ΛΑΘΟΣ 1085-1277", "ΔΕΝ ΕΧΕΙ ΑΜΚΑ", "ΔΕΝ ΕΧΕΙ 3", "λάθος 425", "βλ. 1234"]) {
		expect(parseAm(value), value).toMatchObject({ am: null, kind: "invalid", digits: "" });
	}
	// A note that carries a number is reported as one (its digits dropped); a note
	// with no digit at all is the ordinary non-numeric case. Both are unusable.
	expect(parseAm("ΛΑΘΟΣ 1085")).toMatchObject({ reason: "note" });
	expect(parseAm("ΔΕΝ ΕΧΕΙ ΑΜΚΑ")).toMatchObject({ reason: "non_numeric" });
	// The raw text survives for the report / review note.
	expect(parseAm("ΛΑΘΟΣ 1085").raw).toBe("ΛΑΘΟΣ 1085");
	// Only letter-bearing values are notes — decoration around a number still parses.
	expect(parseAm("(1158)")).toMatchObject({ am: 1158, kind: "valid" });
	// 'Αναμονή' is still the waiting placeholder, not a note.
	expect(parseAm("Αναμονή 999")).toMatchObject({ am: null, kind: "orphan", reason: "waiting" });
});

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

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

import { describe, expect, test } from "bun:test";
import {
	birthYear,
	canonicalClassYear,
	excelDate,
	foldLookalikes,
	greeklish,
	headerColumns,
	instrumentFromHeading,
	isStartingClassYear,
	mergeContinuationRows,
	samePerson,
	sectionClassId,
	sheetSchoolYear,
	splitAddress,
	splitPhones,
	teacherKey,
} from "../../scripts/registry/parse";

describe("registry backfill — sheets", () => {
	test("school year from the sheet name", () => {
		expect(sheetSchoolYear("Μαθητολόγιο 2015 - 2016")).toBe("2015-2016");
		expect(sheetSchoolYear("Μαθητολόγιο 2018-2019")).toBe("2018-2019");
		expect(sheetSchoolYear("Γενικό Μητρώο")).toBeNull();
		expect(sheetSchoolYear("Μαθητολόγιο Β΄ 6 μήνου ΄23")).toBeNull();
	});

	test("overflow rows are glued back to their record, column by column", () => {
		const rows = mergeContinuationRows([
			[12, 15, "Καραμπίνης", "Νικόλαος", null, null, null, null, "Β΄", "Βασίλειος", null],
			[null, null, null, null, null, null, null, null, null, "Παπαγεωργίου", null],
			[13, 16, "Καρκαλέτσου", "Ευαγγελία", null, null, null, null, "Β΄", "Βενέδικτος Γαρουφαλής", null],
		]);
		expect(rows).toHaveLength(2);
		expect(rows[0][9]).toBe("Βασίλειος Παπαγεωργίου");
		expect(rows[1][9]).toBe("Βενέδικτος Γαρουφαλής");
	});

	test("an overflow row with an empty record cell fills it", () => {
		const [row] = mergeContinuationRows([
			[103, 115, null, "Θεόδωρος", null],
			[null, null, "Χατζηθάνος", null, null],
		]);
		expect(row[2]).toBe("Χατζηθάνος");
	});

	test("header columns, both layouts", () => {
		const old = headerColumns([
			"Α/Α",
			"Αριθμός Μητρώου",
			"Επώνυμο",
			"Όνομα",
			"Όνομα πατρός",
			"Έτος Γέννησης",
			"Διεύθυνση",
			"Ημερομηνία Εγγραφής",
			"Τάξη",
			"Διδάσκων Καθηγητής",
			"Παρατηρήσεις",
		]);
		expect(old).toMatchObject({ am: 1, surname: 2, name: 3, father: 4, born: 5, date: 7, classYear: 8, teacher: 9, notes: 10 });
		const later = headerColumns([
			"α/α ",
			"Αριθμός Μητρώου",
			"Επώνυμο",
			"Όνομα",
			"Όνομα Πατρός",
			"Έτος Γέννησης",
			"Διεύθυνση",
			"Έτος Φοίτησης 2018-19",
			"Διδάσκων Καθηγητής",
			"Παρατηρήσεις",
		]);
		expect(later).toMatchObject({ am: 1, father: 4, date: null, classYear: 7, teacher: 8, notes: 9 });
		expect(headerColumns(["Α.  ΣΧΟΛΗ ΒΥΖΑΝΤΙΝΗΣ ΜΟΥΣΙΚΗΣ"])).toBeNull();
	});

	test("sections and instrument tables", () => {
		expect(sectionClassId("Α.  ΣΧΟΛΗ ΒΥΖΑΝΤΙΝΗΣ ΜΟΥΣΙΚΗΣ")).toBe(0);
		expect(sectionClassId("Β.  ΣΧΟΛΗ ΠΑΡΑΔΟΣΙΑΚΗΣ ΜΟΥΣΙΚΗΣ")).toBe(1);
		expect(sectionClassId("Χορδόφωνα")).toBeNull();
		expect(instrumentFromHeading(" Τάξη Ουτίου Α2α.")).toBe(1);
		expect(instrumentFromHeading(" Τάξη Λαούτου Α2β.")).toBe(2);
		expect(instrumentFromHeading(" Τάξη Πολίτικο Λαούτο (Λάφτα) Α2γ.")).toBe(3);
		expect(instrumentFromHeading("Τάξη Ταμπούρ Α2δ.")).toBe(4);
		expect(instrumentFromHeading("Τάξη Ταμπουρά Α2ε.")).toBe(5);
		expect(instrumentFromHeading("Τάξη (Ψαλτηρίου) Κανονακίου Α2θ. ")).toBe(9);
		expect(instrumentFromHeading("Τάξη Νέι Α2ιγ.")).toBe(13);
		expect(instrumentFromHeading("Τάξη Κρητικής Λύρας Βα.")).toBe(21);
		expect(instrumentFromHeading("Τάξη Ποντιακής Λύρας Ββ.")).toBe(22);
		expect(instrumentFromHeading("Τάξη  Πολιτικης Λύρας Α2ι.")).toBe(10);
		expect(instrumentFromHeading("Τάξη Λαϊκής Κιθάρας Γβ.")).toBe(28);
		expect(instrumentFromHeading("Ελληνικό Παραδοσιακό Τραγούδι Α1")).toBe(44);
		expect(instrumentFromHeading("Τμήμα Οργάνων Πανελληνίου και Ευρύτερου Ανατολικού Ρεπερτορίου")).toBeNull();
	});
});

describe("registry backfill — class years", () => {
	test("Byzantine: every way the sheets write it", () => {
		for (const raw of ["Α΄", "A΄", "Α'", "Α", "Α' Ετος"]) expect(canonicalClassYear(raw, 0)).toBe("Α' Έτος");
		expect(canonicalClassYear("B΄", 0)).toBe("Β' Έτος");
		expect(canonicalClassYear("Δ΄ έτος", 0)).toBe("Δ' Έτος");
		expect(canonicalClassYear("E΄", 0)).toBe("Ε' Έτος");
		expect(canonicalClassYear("ΔΙΠΛΩΜΑΤΟΣ Β΄", 0)).toBe("Β' Έτος Διπλώματος");
		expect(canonicalClassYear("Α΄ διπλώματος", 0)).toBe("Α' Έτος Διπλώματος");
		expect(canonicalClassYear("Β΄ έτος διπλώματος", 0)).toBe("Β' Έτος Διπλώματος");
		expect(canonicalClassYear("", 0)).toBe("");
		expect(canonicalClassYear("Προκαταρκτική", 0)).toBe("");
	});

	test("Traditional levels", () => {
		expect(canonicalClassYear("Προκαταρκτική", 1)).toBe("Α' Προκαταρκτική");
		expect(canonicalClassYear("Β΄ Κατωτέρα", 1)).toBe("Β' Κατωτέρα");
		expect(canonicalClassYear("Γ΄ Μέση", 1)).toBe("Γ' Μέση");
		expect(canonicalClassYear("Α' Ανωτέρα", 1)).toBe("Α' Ανωτέρα");
		expect(canonicalClassYear("Γ΄ Ανωτέρα", 1)).toBe(""); // not a real class
	});

	test("starting class years (no placement exam)", () => {
		expect(isStartingClassYear("Α' Έτος", 0)).toBe(true);
		expect(isStartingClassYear("Β' Έτος", 0)).toBe(false);
		expect(isStartingClassYear("Α' Προκαταρκτική", 1)).toBe(true);
		expect(isStartingClassYear("Α' Κατωτέρα", 1)).toBe(true);
		expect(isStartingClassYear("Α' Ανωτέρα", 1)).toBe(false);
	});
});

describe("registry backfill — people", () => {
	test("Latin look-alikes inside Greek words only", () => {
		expect(foldLookalikes("Kωνσταντίνος")).toBe("Κωνσταντίνος");
		expect(foldLookalikes("Bag Cristina")).toBe("Bag Cristina");
	});

	test("teacher keys ignore «π.», word order and «Κων/νος»", () => {
		expect(teacherKey("π. Δημήτριος Καρυτινός")).toBe(teacherKey("Δημήτριος Καρυτινός"));
		expect(teacherKey("Κλησιάρχη Εφραιμία")).toBe(teacherKey("Εφραιμία Κλησιάρχη"));
		expect(teacherKey("Κων/νος Ζησιμόπουλος")).toBe(teacherKey("Κωνσταντίνος Ζησιμόπουλος"));
		expect(teacherKey("π. Μιχαήλ Παπαθεμελῆς")).toBe(teacherKey("π.Μιχαήλ Παπαθεμελής"));
	});

	test("same person despite spelling", () => {
		expect(samePerson({ surname: "Κοντόπουλος", name: "Στέλιος" }, { surname: "Κοντόπουλος", name: "Στυλιανός" })).toBe(true);
		expect(samePerson({ surname: "Πελέκη", name: "Αικατερίνη" }, { surname: "ΠΕΛΕΚΗ", name: "ΚΑΤΕΡΙΝΑ" })).toBe(true);
		expect(samePerson({ surname: "Δαμιανός", name: "Στεφανία" }, { surname: "Damianos", name: "Stefania" })).toBe(true);
		expect(samePerson({ surname: "Καλλιακμάνης", name: "Ιωάννης" }, { surname: "KALLIAKMANIS", name: "IOANNIS" })).toBe(true);
		expect(samePerson({ surname: "Κεφαλά", name: "Μαρία" }, { surname: "Κεφαλά - Φειδάκη", name: "Μαρία" })).toBe(true);
		expect(samePerson({ surname: "Νταλιάνης", name: "Κων/νος" }, { surname: "Νταλιάνης", name: "Κωνσταντίνος" })).toBe(true);
		expect(samePerson({ surname: "Coman", name: "PetreDragos" }, { surname: "Coman", name: "Petre Dragos" })).toBe(true);
		expect(samePerson({ surname: "Κασταναρας", name: "Σακης" }, { surname: "Καστανάρας", name: "Αθανάσιος" })).toBe(true);
		expect(
			samePerson(
				{ surname: "Ταγαρά", name: "Ταγαρά", father: "Νικόλαος", born: 1990 },
				{ surname: "Ταγαρά", name: "Παναγιώτα", father: "Νικόλαος", born: 1990 },
			),
		).toBe(true);
	});

	test("different people stay apart", () => {
		expect(samePerson({ surname: "Καρατοσίδης", name: "Αναστάσιος" }, { surname: "Κοντόπουλος", name: "Δημήτριος" })).toBe(false);
		expect(samePerson({ surname: "Τζώρτζης", name: "Ιωάννης" }, { surname: "Καρανικόλας", name: "Ιωάννης" })).toBe(false);
		// Siblings: one letter apart is not enough when the name is short.
		expect(samePerson({ surname: "Κολλημένος", name: "Ιωάννα" }, { surname: "Κολλημένος", name: "Ιωάννης" })).toBe(false);
		expect(
			samePerson(
				{ surname: "Κολλημένος", name: "Δημήτριος", father: "Γεώργιος", born: 1999 },
				{ surname: "Κολλημένος", name: "Φίλιππος", father: "Γεώργιος", born: 2003 },
			),
		).toBe(false);
		// Twins: same father, same birth year, different given names.
		expect(
			samePerson(
				{ surname: "Σκουτέρης", name: "Αλέξανδρος", father: "Βασίλειος", born: 2008 },
				{ surname: "Σκουτέρης", name: "Ανδρέας", father: "Βασίλειος", born: 2008 },
			),
		).toBe(false);
	});

	test("greeklish keys", () => {
		expect(greeklish("Δαμιανός")).toBe(greeklish("Damianos"));
	});

	test("dates, birth years, phones, addresses", () => {
		expect(new Date(excelDate(42304)!).toISOString().slice(0, 10)).toBe("2015-10-27");
		expect(excelDate("abc")).toBeNull();
		expect(birthYear("2016")).toBe(2016);
		expect(birthYear(1954)).toBe(1954);
		expect(birthYear(null)).toBeNull();
		expect(splitPhones("69820288726982028872")).toEqual({ cellphone: "6982028872", telephone: "" });
		expect(splitPhones("21050629166970614525")).toEqual({ cellphone: "6970614525", telephone: "2105062916" });
		expect(splitPhones("-")).toEqual({ cellphone: "", telephone: "" });
		expect(splitAddress("Αδριανείου 11, Μεταμόρφωση")).toEqual({ road: "Αδριανείου", number: 11, tk: 0, region: "Μεταμόρφωση" });
		expect(splitAddress("Πρεβέζης 21,15121, Πεύκη")).toEqual({ road: "Πρεβέζης", number: 21, tk: 15121, region: "Πεύκη" });
		expect(splitAddress("Μακρυγιάννη  79, Νέα Ιωνία, 14235")).toEqual({ road: "Μακρυγιάννη", number: 79, tk: 14235, region: "Νέα Ιωνία" });
		expect(splitAddress("Κόκκινος Βράχος Ἀφίδνες")).toEqual({ road: "Κόκκινος Βράχος Ἀφίδνες", number: 0, tk: 0, region: "" });
	});
});

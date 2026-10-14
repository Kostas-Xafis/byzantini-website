/**
 * Automatic fees (docs/FEES.md §3) — the pure calculation in lib/fees.
 */
import { describe, expect, test } from "bun:test";
import { classYearLabel, EVALUATION_LABEL, placementClassYearsByMusicType, placementClassYearsForClassId, MusicType } from "../../lib/classYears";
import {
	computeYearFees,
	feeBase,
	orderForFees,
	roundFee,
	TRADITIONAL_FEE_CLASS_YEARS,
	z_FeeCatalogData,
	type FeeCatalogData,
	type FeeEnrollment,
} from "../../lib/fees";

const TAPRANTZIS = 100;
const CHAVIARLIS = 111;

/** The 2026-2027 seed catalog (migration 0006). */
const catalog: FeeCatalogData = {
	evaluation_fee: 100,
	byzantine: { default: 20, teachers: { [TAPRANTZIS]: 50, [CHAVIARLIS]: 50 } },
	traditional: {
		"Α' Προκαταρκτική": 50,
		"Α' Κατωτέρα": 50,
		"Β' Κατωτέρα": 50,
		"Α' Μέση": 50,
		"Β' Μέση": 50,
		"Γ' Μέση": 50,
		"Α' Ανωτέρα": 100,
		"Β' Ανωτέρα": 100,
		"Α' Διπλώματος": 100,
		"Β' Διπλώματος": 100,
	},
	european: { default: 50 },
	multi_enrollment_factor: 0.5,
};
const catalogs = new Map([[1, catalog]]);

let nextId = 1;
const enrollment = (fields: Partial<FeeEnrollment> & Pick<FeeEnrollment, "class_id">): FeeEnrollment => ({
	id: nextId++,
	class_year: fields.class_id === 0 ? "Α' Έτος" : "Α' Μέση",
	teacher_id: 5,
	evaluation: 0,
	fee_catalog_id: 1,
	fee_manual: 0,
	...fields,
});
const byId = (results: ReturnType<typeof computeYearFees>) => new Map(results.map((r) => [r.id, r]));

describe("catalog schema", () => {
	test("the seed catalog validates", () => {
		expect(z_FeeCatalogData.safeParse(catalog).success).toBe(true);
	});
	test("an unknown Traditional class year, a negative price or a factor above 1 are rejected", () => {
		expect(z_FeeCatalogData.safeParse({ ...catalog, traditional: { ...catalog.traditional, "Ζ' Έτος": 10 } }).success).toBe(false);
		expect(z_FeeCatalogData.safeParse({ ...catalog, evaluation_fee: -1 }).success).toBe(false);
		expect(z_FeeCatalogData.safeParse({ ...catalog, multi_enrollment_factor: 1.5 }).success).toBe(false);
		expect(z_FeeCatalogData.safeParse({ ...catalog, byzantine: { default: 20, teachers: { abc: 50 } } }).success).toBe(false);
	});
	test("Traditional prices every class year except «Υπό Κατάταξη»", () => {
		expect(TRADITIONAL_FEE_CLASS_YEARS).not.toContain(EVALUATION_LABEL);
		expect([...TRADITIONAL_FEE_CLASS_YEARS].sort()).toEqual(Object.keys(catalog.traditional).sort());
	});
});

describe("class-year helpers", () => {
	test("classYearLabel shows the class year, else «Υπό Κατάταξη» for evaluation rows", () => {
		expect(classYearLabel("Α' Μέση", true)).toBe("Α' Μέση");
		expect(classYearLabel("", true)).toBe(EVALUATION_LABEL);
		expect(classYearLabel("", 1)).toBe(EVALUATION_LABEL);
		expect(classYearLabel("", false)).toBe("");
	});
	test("the admin lists drop the label, the public lists keep it", () => {
		for (const type of [MusicType.Byzantine, MusicType.Traditional, MusicType.European]) {
			expect(placementClassYearsByMusicType[type]).not.toContain(EVALUATION_LABEL);
		}
		expect(placementClassYearsForClassId(0)).toContain("Α' Έτος");
		expect(placementClassYearsForClassId(1).length).toBe(10);
	});
});

describe("feeBase", () => {
	test("Byzantine: non-affiliated teacher price, else default", () => {
		expect(feeBase({ class_id: 0, class_year: "Α' Έτος", teacher_id: TAPRANTZIS }, catalog)).toBe(50);
		expect(feeBase({ class_id: 0, class_year: "Α' Έτος", teacher_id: 7 }, catalog)).toBe(20);
		expect(feeBase({ class_id: 0, class_year: "", teacher_id: -1 }, catalog)).toBe(20);
	});
	test("Traditional tier edges: Γ' Μέση 50, Α' Ανωτέρα 100", () => {
		expect(feeBase({ class_id: 1, class_year: "Γ' Μέση", teacher_id: 1 }, catalog)).toBe(50);
		expect(feeBase({ class_id: 1, class_year: "Α' Ανωτέρα", teacher_id: 1 }, catalog)).toBe(100);
	});
	test("Traditional awaiting placement or with an unknown class year: null", () => {
		expect(feeBase({ class_id: 1, class_year: "", teacher_id: 1 }, catalog)).toBeNull();
		expect(feeBase({ class_id: 1, class_year: "Άγνωστο", teacher_id: 1 }, catalog)).toBeNull();
	});
	test("European: flat", () => {
		expect(feeBase({ class_id: 2, class_year: "Β' Ανωτέρα", teacher_id: 1 }, catalog)).toBe(50);
	});
});

describe("rounding", () => {
	test("whole euros, half up", () => {
		expect(roundFee(12.5)).toBe(13);
		expect(roundFee(12.49)).toBe(12);
		expect(roundFee(1.005 * 1000)).toBe(1005); // 1004.9999… in binary floating point
		expect(roundFee(0.35 * 30)).toBe(11);
		expect(roundFee(10)).toBe(10);
	});
});

describe("computeYearFees", () => {
	test("owner example: Βυζαντινή + Φωνητική + Λαούτο — Byzantine full, the rest half", () => {
		const byz = enrollment({ class_id: 0, teacher_id: 7 });
		const voice = enrollment({ class_id: 1, class_year: "Α' Ανωτέρα" });
		const lute = enrollment({ class_id: 1, class_year: "Β' Μέση" });
		// insertion order must not matter
		const fees = byId(computeYearFees([lute, voice, byz], catalogs));
		expect(fees.get(byz.id)).toMatchObject({ fee_base: 20, factor: 1, position: 0, total_payment: 20 });
		expect(fees.get(voice.id)).toMatchObject({ fee_base: 100, factor: 0.5, position: 1, total_payment: 50 });
		expect(fees.get(lute.id)).toMatchObject({ fee_base: 50, factor: 0.5, position: 2, total_payment: 25 });
	});

	test("no Byzantine: the first Traditional enrollment is full, the next ones half", () => {
		const eur = enrollment({ class_id: 2 });
		const tradA = enrollment({ class_id: 1, class_year: "Α' Μέση" });
		const tradB = enrollment({ class_id: 1, class_year: "Α' Ανωτέρα" });
		const fees = byId(computeYearFees([eur, tradB, tradA], catalogs));
		expect(fees.get(tradA.id)!.total_payment).toBe(50);
		expect(fees.get(tradB.id)!.total_payment).toBe(50); // 100 × 0.5
		expect(fees.get(eur.id)!.total_payment).toBe(25);
	});

	test("ties are broken by id (earlier registration first)", () => {
		const later = { ...enrollment({ class_id: 1, class_year: "Α' Ανωτέρα" }), id: 900 };
		const earlier = { ...enrollment({ class_id: 1, class_year: "Α' Μέση" }), id: 800 };
		expect(orderForFees([later, earlier]).map((e) => e.id)).toEqual([800, 900]);
		const fees = byId(computeYearFees([later, earlier], catalogs));
		expect(fees.get(800)!.factor).toBe(1);
		expect(fees.get(900)!.total_payment).toBe(50);
	});

	test("non-affiliated teacher: 50, halved when not first", () => {
		const alone = enrollment({ class_id: 0, teacher_id: TAPRANTZIS });
		expect(computeYearFees([alone], catalogs)[0]!.total_payment).toBe(50);

		// Byzantine is always first, so a second Byzantine enrollment (later id) is the halved one.
		const first = enrollment({ class_id: 0, teacher_id: 7 });
		const second = enrollment({ class_id: 0, teacher_id: CHAVIARLIS });
		const fees = byId(computeYearFees([first, second], catalogs));
		expect(fees.get(first.id)!.total_payment).toBe(20);
		expect(fees.get(second.id)).toMatchObject({ fee_base: 50, factor: 0.5, total_payment: 25 });
	});

	test("Traditional awaiting placement: evaluation fee only, and it still occupies its position", () => {
		const waiting = enrollment({ class_id: 1, class_year: "", evaluation: 1 });
		const eur = enrollment({ class_id: 2 });
		const fees = byId(computeYearFees([waiting, eur], catalogs));
		expect(fees.get(waiting.id)).toMatchObject({ fee_base: null, evaluation_fee: 100, factor: 1, total_payment: 100 });
		expect(fees.get(eur.id)!.total_payment).toBe(25);
	});

	test("placement keeps the evaluation fee and adds the class price", () => {
		const placed = enrollment({ class_id: 1, class_year: "Α' Ανωτέρα", evaluation: true });
		expect(computeYearFees([placed], catalogs)[0]).toMatchObject({ fee_base: 100, evaluation_fee: 100, total_payment: 200 });
	});

	test("the evaluation fee is never halved", () => {
		const byz = enrollment({ class_id: 0, teacher_id: 7 });
		const evalTrad = enrollment({ class_id: 1, class_year: "Γ' Μέση", evaluation: 1 });
		const fees = byId(computeYearFees([byz, evalTrad], catalogs));
		expect(fees.get(evalTrad.id)).toMatchObject({ fee_base: 50, evaluation_fee: 100, factor: 0.5, total_payment: 125 });
		const evalByz = enrollment({ class_id: 0, class_year: "", evaluation: 1 });
		const fees2 = byId(computeYearFees([byz, evalByz], catalogs));
		expect(fees2.get(evalByz.id)!.total_payment).toBe(110); // 20 × 0.5 + 100
	});

	test("manual rows keep their total (no result) but occupy a position", () => {
		const manualByz = enrollment({ class_id: 0, teacher_id: 7, fee_manual: 1 });
		const trad = enrollment({ class_id: 1, class_year: "Α' Μέση" });
		const results = computeYearFees([manualByz, trad], catalogs);
		expect(results.map((r) => r.id)).toEqual([trad.id]);
		expect(results[0]).toMatchObject({ position: 1, factor: 0.5, total_payment: 25 });
	});

	test("unpinned rows (pre-2026-27 / no catalog) get no result but occupy a position", () => {
		const legacy = enrollment({ class_id: 0, fee_catalog_id: null });
		const trad = enrollment({ class_id: 1, class_year: "Α' Μέση" });
		const results = computeYearFees([legacy, trad], catalogs);
		expect(results.map((r) => r.id)).toEqual([trad.id]);
		expect(results[0]!.factor).toBe(0.5);
	});

	test("a pinned catalog id that cannot be found is skipped", () => {
		const orphan = enrollment({ class_id: 0, fee_catalog_id: 99 });
		expect(computeYearFees([orphan], catalogs)).toEqual([]);
	});

	test("per-enrollment pinned catalogs: each row uses its own prices and factor", () => {
		const v2: FeeCatalogData = {
			...catalog,
			evaluation_fee: 80,
			byzantine: { default: 30, teachers: {} },
			traditional: { ...catalog.traditional, "Α' Μέση": 60 },
			european: { default: 70 },
			multi_enrollment_factor: 0.25,
		};
		const both = { 1: catalog, 2: v2 };
		const byzV1 = enrollment({ class_id: 0, teacher_id: TAPRANTZIS, fee_catalog_id: 1 });
		const tradV2 = enrollment({ class_id: 1, class_year: "Α' Μέση", fee_catalog_id: 2, evaluation: 1 });
		const eurV1 = enrollment({ class_id: 2, fee_catalog_id: 1 });
		const fees = byId(computeYearFees([eurV1, tradV2, byzV1], both));
		expect(fees.get(byzV1.id)!.total_payment).toBe(50); // v1 teacher price, full
		expect(fees.get(tradV2.id)).toMatchObject({ fee_base: 60, factor: 0.25, evaluation_fee: 80, total_payment: 95 }); // 15 + 80
		expect(fees.get(eurV1.id)).toMatchObject({ fee_base: 50, factor: 0.5, total_payment: 25 });
	});

	test("odd prices round half up", () => {
		const odd: FeeCatalogData = { ...catalog, european: { default: 45 }, traditional: { ...catalog.traditional, "Α' Μέση": 35 } };
		const oddCatalogs = new Map([[1, odd]]);
		const trad = enrollment({ class_id: 1, class_year: "Β' Μέση" });
		const tradOdd = enrollment({ class_id: 1, class_year: "Α' Μέση" });
		const eur = enrollment({ class_id: 2 });
		const fees = byId(computeYearFees([trad, tradOdd, eur], oddCatalogs));
		expect(fees.get(tradOdd.id)!.total_payment).toBe(18); // 17.5 → 18
		expect(fees.get(eur.id)!.total_payment).toBe(23); // 22.5 → 23
	});

	test("an empty year gives no results", () => {
		expect(computeYearFees([], catalogs)).toEqual([]);
	});

	test("catalogs may be passed as a plain record", () => {
		const byz = enrollment({ class_id: 0 });
		expect(computeYearFees([byz], { 1: catalog })[0]!.total_payment).toBe(20);
	});
});

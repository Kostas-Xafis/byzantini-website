/**
 * Automatic fees (docs/FEES.md §2/§3) — the rule catalog and the pure calculation in lib/fees.
 */
import { describe, expect, test } from "bun:test";
import { classYearLabel, EVALUATION_LABEL, placementClassYearsByMusicType, placementClassYearsForClassId, MusicType } from "../../lib/classYears";
import {
	computeYearFees,
	feeBase,
	feeRuleConflicts,
	feeRuleRank,
	orderForFees,
	roundFee,
	z_FeeCatalogInput,
	z_FeeRule,
	type FeeCatalogInput,
	type FeeEnrollment,
	type FeeRule,
} from "../../lib/fees";

const TAPRANTZIS = 100;
const CHAVIARLIS = 111;
const LOWER = ["Α' Προκαταρκτική", "Α' Κατωτέρα", "Β' Κατωτέρα", "Α' Μέση", "Β' Μέση", "Γ' Μέση"];
const UPPER = ["Α' Ανωτέρα", "Β' Ανωτέρα", "Α' Διπλώματος", "Β' Διπλώματος"];

const rule = (class_id: 0 | 1 | 2, price: number, extra: Partial<Pick<FeeRule, "class_years" | "teacher_id">> = {}): FeeRule => ({
	class_id,
	class_years: null,
	teacher_id: null,
	price,
	...extra,
});

/** The 2026-2027 seed catalog, as migration 0007 converts it. */
const catalog: FeeCatalogInput = {
	evaluation_fee: 80,
	multi_enrollment_factor: 0.5,
	rules: [
		rule(0, 20),
		rule(0, 50, { teacher_id: TAPRANTZIS }),
		rule(0, 50, { teacher_id: CHAVIARLIS }),
		rule(1, 50, { class_years: LOWER }),
		rule(1, 100, { class_years: UPPER }),
		rule(2, 50),
	],
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
		expect(z_FeeCatalogInput.safeParse(catalog).success).toBe(true);
	});
	test("a negative / fractional price, a factor above 1 or a negative evaluation fee are rejected", () => {
		expect(z_FeeCatalogInput.safeParse({ ...catalog, evaluation_fee: -1 }).success).toBe(false);
		expect(z_FeeCatalogInput.safeParse({ ...catalog, multi_enrollment_factor: 1.5 }).success).toBe(false);
		expect(z_FeeRule.safeParse(rule(2, -5)).success).toBe(false);
		expect(z_FeeRule.safeParse(rule(2, 12.5)).success).toBe(false);
	});
	test("class years are validated against the department's placement list", () => {
		expect(z_FeeRule.safeParse(rule(1, 50, { class_years: ["Α' Μέση"] })).success).toBe(true);
		expect(z_FeeRule.safeParse(rule(0, 50, { class_years: ["Α' Μέση"] })).success).toBe(false); // a Traditional year on Byzantine
		expect(z_FeeRule.safeParse(rule(1, 50, { class_years: [EVALUATION_LABEL] })).success).toBe(false);
		expect(z_FeeRule.safeParse(rule(1, 50, { class_years: [] })).success).toBe(false);
		expect(z_FeeRule.safeParse(rule(1, 50, { class_years: ["Α' Μέση", "Α' Μέση"] })).success).toBe(false);
		expect(z_FeeRule.safeParse({ ...rule(3 as 0, 50) }).success).toBe(false);
		expect(z_FeeRule.safeParse(rule(0, 50, { teacher_id: 0 })).success).toBe(false);
	});
	test("overlapping rules are rejected per department + teacher", () => {
		// two all-years base rules
		expect(feeRuleConflicts([rule(0, 20), rule(0, 30)]).map((c) => c.index)).toEqual([1]);
		// a class year covered twice
		expect(feeRuleConflicts([rule(1, 50, { class_years: LOWER }), rule(1, 60, { class_years: ["Γ' Μέση", "Α' Ανωτέρα"] })]).map((c) => c.index)).toEqual([
			1,
		]);
		// the same teacher twice (all years)
		expect(feeRuleConflicts([rule(0, 50, { teacher_id: 7 }), rule(0, 40, { teacher_id: 7 })])).toHaveLength(1);
		expect(z_FeeCatalogInput.safeParse({ ...catalog, rules: [...catalog.rules, rule(2, 60)] }).success).toBe(false);
	});
	test("the levels of precedence may coexist", () => {
		const rules = [
			rule(1, 50),
			rule(1, 70, { class_years: UPPER }),
			rule(1, 40, { teacher_id: 9 }),
			rule(1, 90, { teacher_id: 9, class_years: ["Β' Διπλώματος"] }),
			rule(1, 45, { teacher_id: 10, class_years: LOWER }),
			rule(1, 95, { teacher_id: 10, class_years: UPPER }),
			rule(2, 50),
			rule(0, 50, { class_years: ["Α' Έτος"] }),
		];
		expect(feeRuleConflicts(rules)).toEqual([]);
		expect(z_FeeCatalogInput.safeParse({ ...catalog, rules }).success).toBe(true);
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
	test("a department without any rule: null", () => {
		expect(feeBase({ class_id: 2, class_year: "Α' Μέση", teacher_id: 1 }, { rules: [rule(0, 20)] })).toBeNull();
	});
	test("precedence: teacher + class years > teacher > class years > department base", () => {
		const rules = {
			rules: [
				rule(1, 10),
				rule(1, 20, { class_years: UPPER }),
				rule(1, 30, { teacher_id: 9 }),
				rule(1, 40, { teacher_id: 9, class_years: ["Β' Διπλώματος"] }),
			],
		};
		expect(feeBase({ class_id: 1, class_year: "Α' Μέση", teacher_id: 5 }, rules)).toBe(10); // base
		expect(feeBase({ class_id: 1, class_year: "Α' Ανωτέρα", teacher_id: 5 }, rules)).toBe(20); // class years
		expect(feeBase({ class_id: 1, class_year: "Α' Ανωτέρα", teacher_id: 9 }, rules)).toBe(30); // teacher beats class years
		expect(feeBase({ class_id: 1, class_year: "Β' Διπλώματος", teacher_id: 9 }, rules)).toBe(40); // teacher + years beats all
		// order of the rules in the catalog does not matter
		expect(feeBase({ class_id: 1, class_year: "Β' Διπλώματος", teacher_id: 9 }, { rules: [...rules.rules].reverse() })).toBe(40);
		expect([
			feeRuleRank(rule(1, 0, { teacher_id: 9, class_years: UPPER })),
			feeRuleRank(rule(1, 0, { teacher_id: 9 })),
			feeRuleRank(rule(1, 0, { class_years: UPPER })),
			feeRuleRank(rule(1, 0)),
		]).toEqual([0, 1, 2, 3]);
	});
	test("a teacher rule with class years only applies to those years", () => {
		const rules = { rules: [rule(1, 50), rule(1, 90, { teacher_id: 9, class_years: UPPER })] };
		expect(feeBase({ class_id: 1, class_year: "Α' Μέση", teacher_id: 9 }, rules)).toBe(50);
		expect(feeBase({ class_id: 1, class_year: "Α' Ανωτέρα", teacher_id: 9 }, rules)).toBe(90);
	});
	test("rules only apply to their own department", () => {
		const rules = { rules: [rule(0, 50, { teacher_id: 9 }), rule(1, 70)] };
		expect(feeBase({ class_id: 1, class_year: "Α' Μέση", teacher_id: 9 }, rules)).toBe(70);
	});
	test("awaiting placement: only all-years rules match", () => {
		// Traditional with an all-years price: priced immediately (teacher all-years > base)
		const withBase = {
			rules: [rule(1, 60), rule(1, 100, { class_years: UPPER }), rule(1, 75, { teacher_id: 9 }), rule(1, 99, { teacher_id: 8, class_years: LOWER })],
		};
		expect(feeBase({ class_id: 1, class_year: "", teacher_id: 5 }, withBase)).toBe(60);
		expect(feeBase({ class_id: 1, class_year: "", teacher_id: 9 }, withBase)).toBe(75);
		expect(feeBase({ class_id: 1, class_year: "", teacher_id: 8 }, withBase)).toBe(60); // teacher + years cannot match ''
		// without an all-years price: unknown until placement
		expect(feeBase({ class_id: 1, class_year: "", teacher_id: 5 }, catalog)).toBeNull();
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
		expect(fees.get(waiting.id)).toMatchObject({ fee_base: null, evaluation_fee: 80, factor: 1, total_payment: 80 });
		expect(fees.get(eur.id)!.total_payment).toBe(25);
	});

	test("placement keeps the evaluation fee and adds the class price", () => {
		const placed = enrollment({ class_id: 1, class_year: "Α' Ανωτέρα", evaluation: true });
		expect(computeYearFees([placed], catalogs)[0]).toMatchObject({ fee_base: 100, evaluation_fee: 80, total_payment: 180 });
	});

	test("the evaluation fee is never halved", () => {
		const byz = enrollment({ class_id: 0, teacher_id: 7 });
		const evalTrad = enrollment({ class_id: 1, class_year: "Γ' Μέση", evaluation: 1 });
		const fees = byId(computeYearFees([byz, evalTrad], catalogs));
		expect(fees.get(evalTrad.id)).toMatchObject({ fee_base: 50, evaluation_fee: 80, factor: 0.5, total_payment: 105 });
		const evalByz = enrollment({ class_id: 0, class_year: "", evaluation: 1 });
		const fees2 = byId(computeYearFees([byz, evalByz], catalogs));
		expect(fees2.get(evalByz.id)!.total_payment).toBe(90); // 20 × 0.5 + 80
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
		const v2: FeeCatalogInput = {
			evaluation_fee: 80,
			multi_enrollment_factor: 0.25,
			rules: [rule(0, 30), rule(1, 60, { class_years: ["Α' Μέση"] }), rule(2, 70)],
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
		const odd: FeeCatalogInput = { ...catalog, rules: [rule(1, 50, { class_years: ["Β' Μέση"] }), rule(1, 35, { class_years: ["Α' Μέση"] }), rule(2, 45)] };
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

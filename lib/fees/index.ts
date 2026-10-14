/**
 * Automatic yearly fees (docs/FEES.md) — the price catalog (settings + rules) and the pure calculation.
 *
 * Client-safe: no DB, no env, no server imports. The server (`lib/fees/recalculate.server.ts`) loads the
 * enrollments and catalogs and writes the result; the admin UI may run the same functions for a live
 * breakdown.
 */
import { placementClassYearsForClassId } from "@lib/classYears";
import { z } from "astro/zod";

/** class_id values (the music-type tabs). */
export const CLASS_BYZANTINE = 0;
export const CLASS_TRADITIONAL = 1;
export const CLASS_EUROPEAN = 2;

/** Department order of the multi-enrollment discount: Βυζαντινή → Παραδοσιακή → Ευρωπαϊκή (FEES.md §3, step 1). */
export const FEE_DEPARTMENT_ORDER: readonly number[] = [CLASS_BYZANTINE, CLASS_TRADITIONAL, CLASS_EUROPEAN];

const price = (message: string) => z.number(message).int(message).min(0, message);

/** A catalog's settings. */
export const z_FeeCatalogSettings = z.object({
	/** ONE amount for every department; per enrollment with `evaluation = 1`, never discounted. */
	evaluation_fee: price("Μη έγκυρο τέλος κατάταξης"),
	/** Applied to every enrollment after the first of the pupil's year (0.5 = half price). */
	multi_enrollment_factor: z.number("Μη έγκυρος συντελεστής έκπτωσης").min(0, "Μη έγκυρος συντελεστής έκπτωσης").max(1, "Μη έγκυρος συντελεστής έκπτωσης"),
});
export type FeeCatalogSettings = z.infer<typeof z_FeeCatalogSettings>;

/**
 * One price rule (docs/FEES.md §2). `class_years`: null = every class year of the department, otherwise a
 * non-empty set of the department's placement class years (the editor offers ranges; storage is the set).
 * `teacher_id`: null = any teacher.
 */
export const z_FeeRule = z
	.object({
		class_id: z.union([z.literal(CLASS_BYZANTINE), z.literal(CLASS_TRADITIONAL), z.literal(CLASS_EUROPEAN)], { message: "Μη έγκυρο τμήμα" }),
		class_years: z.array(z.string("Μη έγκυρο έτος φοίτησης")).min(1, "Επιλέξτε τουλάχιστον ένα έτος φοίτησης").nullable(),
		teacher_id: z.number("Μη έγκυρος καθηγητής").int("Μη έγκυρος καθηγητής").min(1, "Μη έγκυρος καθηγητής").nullable(),
		price: price("Μη έγκυρη τιμή"),
	})
	.superRefine((rule, ctx) => {
		if (!rule.class_years) return;
		const allowed = placementClassYearsForClassId(rule.class_id);
		const seen = new Set<string>();
		rule.class_years.forEach((year, index) => {
			if (!allowed.includes(year)) ctx.addIssue({ code: "custom", path: ["class_years", index], message: `Άγνωστο έτος φοίτησης για το τμήμα: ${year}` });
			else if (seen.has(year)) ctx.addIssue({ code: "custom", path: ["class_years", index], message: `Διπλό έτος φοίτησης: ${year}` });
			seen.add(year);
		});
	});
export type FeeRule = z.infer<typeof z_FeeRule>;

/** Precedence rank of a rule (lower wins): teacher + class years > teacher > class years > department base. */
export const feeRuleRank = (rule: Pick<FeeRule, "class_years" | "teacher_id">): number =>
	rule.teacher_id !== null ? (rule.class_years ? 0 : 1) : rule.class_years ? 2 : 3;

/**
 * Ambiguity check: within the same department + teacher (or no teacher), no class year may be covered by two
 * rules and there is at most one all-years rule. Returns one message per conflict, keyed by rule index.
 */
export function feeRuleConflicts(rules: readonly FeeRule[]): { index: number; message: string }[] {
	const conflicts: { index: number; message: string }[] = [];
	const groups = new Map<string, { allYears?: number; years: Map<string, number> }>();
	rules.forEach((rule, index) => {
		const key = `${rule.class_id}|${rule.teacher_id ?? ""}`;
		const group = groups.get(key) ?? { years: new Map<string, number>() };
		groups.set(key, group);
		if (rule.class_years === null) {
			if (group.allYears !== undefined) conflicts.push({ index, message: `Διπλή τιμή για όλα τα έτη (ίδια με τον κανόνα ${group.allYears + 1})` });
			else group.allYears = index;
			return;
		}
		for (const year of new Set(rule.class_years)) {
			const other = group.years.get(year);
			if (other !== undefined) conflicts.push({ index, message: `Το έτος «${year}» καλύπτεται ήδη από τον κανόνα ${other + 1}` });
			else group.years.set(year, index);
		}
	});
	return conflicts;
}

/** A catalog's rules, validated per rule and for ambiguity. */
export const z_FeeRules = z.array(z_FeeRule).superRefine((rules, ctx) => {
	for (const { index, message } of feeRuleConflicts(rules)) ctx.addIssue({ code: "custom", path: [index], message });
});

/** A catalog version as created / priced: settings + rules. */
export const z_FeeCatalogInput = z_FeeCatalogSettings.extend({ rules: z_FeeRules });
export type FeeCatalogInput = z.infer<typeof z_FeeCatalogInput>;

/** "2026-2027": two consecutive years. */
export const z_SchoolYear = z
	.string("Μη έγκυρο σχολικό έτος")
	.regex(/^\d{4}-\d{4}$/, "Μη έγκυρο σχολικό έτος")
	.refine((value) => {
		const [start, end] = value.split("-").map(Number);
		return end === start + 1;
	}, "Μη έγκυρο σχολικό έτος");

/** One catalog version as the API returns it (`fee_catalogs` row + its `fee_catalog_rules`). */
export const z_FeeCatalog = z_FeeCatalogSettings.extend({
	id: z.number().int().min(1),
	school_year: z.string(),
	rules: z.array(z_FeeRule),
	created_at: z.number().int().min(0),
	created_by: z.string().nullable(),
});
export type FeeCatalog = z.infer<typeof z_FeeCatalog>;

/** What the calculation needs from an enrollment. */
export type FeeEnrollment = {
	id: number;
	class_id: number;
	class_year: string;
	teacher_id: number;
	evaluation: boolean | number;
	fee_catalog_id: number | null;
	fee_manual: boolean | number;
};

/** The computed fees of one (pinned, non-manual) enrollment. */
export type FeeResult = {
	id: number;
	/** Class price from the pinned catalog, before the discount; null while unknown (Traditional awaiting placement). */
	fee_base: number | null;
	/** The catalog's evaluation fee when `evaluation = 1`, else 0. */
	evaluation_fee: number;
	/** 1 for the first enrollment of the pupil's year, else the catalog's `multi_enrollment_factor`. */
	factor: number;
	/** 0-based position in the department order. */
	position: number;
	/** `round(fee_base × factor) + evaluation_fee`. */
	total_payment: number;
};

/** Whole euros, half up (guards against binary-float artefacts such as 10.499999…). */
export const roundFee = (value: number): number => Math.floor(Number(value.toFixed(6)) + 0.5);

/**
 * The class price of an enrollment from a catalog (FEES.md §3, step 3): the matching rule of its department
 * with the highest precedence — teacher + class years > teacher (all years) > class years > department base.
 * An enrollment awaiting placement (`class_year` '') only matches all-years rules. null when nothing matches
 * (e.g. Traditional awaiting placement without an all-years price).
 */
export function feeBase(enrollment: Pick<FeeEnrollment, "class_id" | "class_year" | "teacher_id">, catalog: Pick<FeeCatalogInput, "rules">): number | null {
	let best: FeeRule | undefined;
	for (const rule of catalog.rules) {
		if (rule.class_id !== enrollment.class_id) continue;
		if (rule.teacher_id !== null && rule.teacher_id !== enrollment.teacher_id) continue;
		if (rule.class_years !== null && !(enrollment.class_year && rule.class_years.includes(enrollment.class_year))) continue;
		if (!best || feeRuleRank(rule) < feeRuleRank(best)) best = rule;
	}
	return best ? best.price : null;
}

/** The evaluation fee of an enrollment: the catalog's flat fee when it took the evaluation exam, else 0. */
export const evaluationFee = (enrollment: Pick<FeeEnrollment, "evaluation">, catalog: FeeCatalogSettings): number =>
	enrollment.evaluation ? catalog.evaluation_fee : 0;

const departmentRank = (classId: number) => {
	const rank = FEE_DEPARTMENT_ORDER.indexOf(classId);
	return rank === -1 ? FEE_DEPARTMENT_ORDER.length : rank;
};

/** The enrollments of one pupil-year in discount order: department (Byz → Trad → Eur), then id (earlier first). */
export function orderForFees<T extends Pick<FeeEnrollment, "id" | "class_id">>(enrollments: readonly T[]): T[] {
	return [...enrollments].sort((a, b) => departmentRank(a.class_id) - departmentRank(b.class_id) || a.id - b.id);
}

/**
 * The fees of ONE pupil's enrollments of ONE school year (FEES.md §3).
 *
 * Every enrollment occupies a position (manual and unpinned ones included); only the rows with a pinned
 * catalog (`fee_catalog_id` present in `catalogsById`) and `fee_manual = 0` get a result — the others keep
 * their `total_payment`. Each row is priced from ITS OWN pinned catalog, discount factor included.
 */
export function computeYearFees(
	enrollments: readonly FeeEnrollment[],
	catalogsById: ReadonlyMap<number, FeeCatalogInput> | Readonly<Record<number, FeeCatalogInput>>,
): FeeResult[] {
	const lookup = (id: number): FeeCatalogInput | undefined =>
		catalogsById instanceof Map ? catalogsById.get(id) : (catalogsById as Readonly<Record<number, FeeCatalogInput>>)[id];
	const results: FeeResult[] = [];
	orderForFees(enrollments).forEach((enrollment, position) => {
		if (enrollment.fee_catalog_id == null || enrollment.fee_manual) return;
		const catalog = lookup(enrollment.fee_catalog_id);
		if (!catalog) return;
		const base = feeBase(enrollment, catalog);
		const factor = position === 0 ? 1 : catalog.multi_enrollment_factor;
		const evaluation_fee = evaluationFee(enrollment, catalog);
		results.push({
			id: enrollment.id,
			fee_base: base,
			evaluation_fee,
			factor,
			position,
			total_payment: roundFee((base ?? 0) * factor) + evaluation_fee,
		});
	});
	return results;
}

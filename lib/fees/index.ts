/**
 * Automatic yearly fees (docs/FEES.md) — the price catalog shape and the pure calculation.
 *
 * Client-safe: no DB, no env, no server imports. The server (`lib/fees/recalculate.server.ts`) loads the
 * enrollments and catalogs and writes the result; the admin UI may run the same functions for a live
 * breakdown.
 */
import { MusicType, placementClassYearsByMusicType } from "@lib/classYears";
import { z } from "astro/zod";

/** class_id values (the music-type tabs). */
export const CLASS_BYZANTINE = 0;
export const CLASS_TRADITIONAL = 1;
export const CLASS_EUROPEAN = 2;

/** Department order of the multi-enrollment discount: Βυζαντινή → Παραδοσιακή → Ευρωπαϊκή (FEES.md §3, step 1). */
export const FEE_DEPARTMENT_ORDER: readonly number[] = [CLASS_BYZANTINE, CLASS_TRADITIONAL, CLASS_EUROPEAN];

/** The class years a Traditional catalog prices (every Traditional class year except «Υπό Κατάταξη»). */
export const TRADITIONAL_FEE_CLASS_YEARS: readonly string[] = placementClassYearsByMusicType[MusicType.Traditional];

const price = (message: string) => z.number(message).int(message).min(0, message);

/** The catalog JSON stored in `fee_catalogs.data`. */
export const z_FeeCatalogData = z.object({
	/** Flat, per enrollment with `evaluation = 1`, never discounted. */
	evaluation_fee: price("Μη έγκυρο τέλος κατάταξης"),
	byzantine: z.object({
		default: price("Μη έγκυρη τιμή Βυζαντινής μουσικής"),
		/** Non-affiliated teachers: teacher id (as a string key) → price. */
		teachers: z.record(z.string().regex(/^\d+$/, "Μη έγκυρος καθηγητής"), price("Μη έγκυρη τιμή καθηγητή")),
	}),
	/** Traditional price per class year. */
	traditional: z.record(z.string(), price("Μη έγκυρη τιμή Παραδοσιακής μουσικής")).superRefine((value, ctx) => {
		for (const key of Object.keys(value)) {
			if (!TRADITIONAL_FEE_CLASS_YEARS.includes(key)) ctx.addIssue({ code: "custom", path: [key], message: `Άγνωστο έτος φοίτησης: ${key}` });
		}
	}),
	european: z.object({ default: price("Μη έγκυρη τιμή Ευρωπαϊκής μουσικής") }),
	/** Applied to every enrollment after the first of the pupil's year (0.5 = half price). */
	multi_enrollment_factor: z.number("Μη έγκυρος συντελεστής έκπτωσης").min(0, "Μη έγκυρος συντελεστής έκπτωσης").max(1, "Μη έγκυρος συντελεστής έκπτωσης"),
});
export type FeeCatalogData = z.infer<typeof z_FeeCatalogData>;

/** "2026-2027": two consecutive years. */
export const z_SchoolYear = z
	.string("Μη έγκυρο σχολικό έτος")
	.regex(/^\d{4}-\d{4}$/, "Μη έγκυρο σχολικό έτος")
	.refine((value) => {
		const [start, end] = value.split("-").map(Number);
		return end === start + 1;
	}, "Μη έγκυρο σχολικό έτος");

/** One `fee_catalogs` row, with its JSON parsed. */
export const z_FeeCatalog = z.object({
	id: z.number().int().min(1),
	school_year: z.string(),
	data: z_FeeCatalogData,
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
 * The class price of an enrollment from a catalog (FEES.md §3, step 3): Byzantine — the non-affiliated
 * teacher's price or the default; Traditional — the price of the class year (null if empty/unknown);
 * European — the flat default. Unknown departments: null.
 */
export function feeBase(enrollment: Pick<FeeEnrollment, "class_id" | "class_year" | "teacher_id">, catalog: FeeCatalogData): number | null {
	switch (enrollment.class_id) {
		case CLASS_BYZANTINE:
			return catalog.byzantine.teachers[String(enrollment.teacher_id)] ?? catalog.byzantine.default;
		case CLASS_TRADITIONAL:
			return enrollment.class_year ? (catalog.traditional[enrollment.class_year] ?? null) : null;
		case CLASS_EUROPEAN:
			return catalog.european.default;
		default:
			return null;
	}
}

/** The evaluation fee of an enrollment: the catalog's flat fee when it took the evaluation exam, else 0. */
export const evaluationFee = (enrollment: Pick<FeeEnrollment, "evaluation">, catalog: FeeCatalogData): number =>
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
	catalogsById: ReadonlyMap<number, FeeCatalogData> | Readonly<Record<number, FeeCatalogData>>,
): FeeResult[] {
	const lookup = (id: number): FeeCatalogData | undefined =>
		catalogsById instanceof Map ? catalogsById.get(id) : (catalogsById as Readonly<Record<number, FeeCatalogData>>)[id];
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

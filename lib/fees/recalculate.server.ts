/**
 * Fee recalculation — SERVER ONLY (D1). Loads a pupil-year's enrollments and their pinned catalogs, runs the
 * pure calculation (`lib/fees`) and writes the changed rows in one `db.batch` (D1 has no transactions).
 * See docs/FEES.md §3.
 */
import { getDb, logQuery } from "@lib/db";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { computeYearFees, z_FeeCatalogData, type FeeCatalog, type FeeCatalogData, type FeeEnrollment, type FeeResult } from "./index";

export type PupilYear = { pupil_id: number; registration_year: string };

/** An enrollment row as the recalculation reads it. */
export type FeeEnrollmentRow = FeeEnrollment & {
	pupil_id: number;
	registration_year: string;
	fee_base: number | null;
	evaluation_fee: number;
	total_payment: number;
};

type CatalogRow = { id: number; school_year: string; data: string; created_at: number; created_by: string | null };

/** Parses a `fee_catalogs` row; an invalid JSON payload is logged and treated as missing. */
export function parseCatalogRow(row: CatalogRow): FeeCatalog | null {
	try {
		const data = z_FeeCatalogData.safeParse(JSON.parse(row.data));
		if (!data.success) {
			console.error(`[fees] fee_catalogs #${row.id} has an invalid payload`);
			return null;
		}
		return { id: row.id, school_year: row.school_year, data: data.data, created_at: row.created_at, created_by: row.created_by };
	} catch {
		console.error(`[fees] fee_catalogs #${row.id} is not valid JSON`);
		return null;
	}
}

/** The active catalog of a school year: its newest version, or null when the year has none. */
export async function getActiveCatalog(schoolYear: string): Promise<FeeCatalog | null> {
	const [row] = await executeQuery<CatalogRow>("SELECT * FROM fee_catalogs WHERE school_year = ? ORDER BY id DESC LIMIT 1", [schoolYear]);
	return row ? parseCatalogRow(row) : null;
}

/** Every version of a school year's catalog, newest first. */
export async function getCatalogVersions(schoolYear: string): Promise<FeeCatalog[]> {
	const rows = await executeQuery<CatalogRow>("SELECT * FROM fee_catalogs WHERE school_year = ? ORDER BY id DESC", [schoolYear]);
	return rows.map(parseCatalogRow).filter((catalog): catalog is FeeCatalog => catalog !== null);
}

/** Catalog payloads by id. */
export async function loadCatalogs(ids: Iterable<number | null>): Promise<Map<number, FeeCatalogData>> {
	const unique = [...new Set([...ids].filter((id): id is number => typeof id === "number"))];
	const catalogs = new Map<number, FeeCatalogData>();
	if (unique.length === 0) return catalogs;
	const rows = await executeQuery<CatalogRow>(`SELECT * FROM fee_catalogs WHERE id IN (${questionMarks(unique)})`, unique);
	for (const row of rows) {
		const catalog = parseCatalogRow(row);
		if (catalog) catalogs.set(catalog.id, catalog.data);
	}
	return catalogs;
}

const ENROLLMENT_FEE_COLUMNS =
	"id, pupil_id, registration_year, class_id, class_year, teacher_id, evaluation, fee_catalog_id, fee_manual, fee_base, evaluation_fee, total_payment";

/** All enrollments of one pupil-year. */
export function loadPupilYear({ pupil_id, registration_year }: PupilYear): Promise<FeeEnrollmentRow[]> {
	return executeQuery<FeeEnrollmentRow>(`SELECT ${ENROLLMENT_FEE_COLUMNS} FROM pupil_enrollments WHERE pupil_id = ? AND registration_year = ?`, [
		pupil_id,
		registration_year,
	]);
}

/** The pupil-years of a set of enrollment ids (before deleting / moving them). */
export function pupilYearsOf(enrollmentIds: number[]): Promise<PupilYear[]> {
	if (enrollmentIds.length === 0) return Promise.resolve([]);
	return executeQuery<PupilYear>(
		`SELECT DISTINCT pupil_id, registration_year FROM pupil_enrollments WHERE id IN (${questionMarks(enrollmentIds)})`,
		enrollmentIds,
	);
}

const keyOf = (pair: PupilYear) => `${pair.pupil_id}|${pair.registration_year}`;

/** The rows whose stored fees differ from the computed ones. */
export function changedFees(rows: readonly FeeEnrollmentRow[], results: readonly FeeResult[]): FeeResult[] {
	const byId = new Map(rows.map((row) => [row.id, row]));
	return results.filter((result) => {
		const row = byId.get(result.id);
		if (!row) return false;
		return (row.fee_base ?? null) !== result.fee_base || row.evaluation_fee !== result.evaluation_fee || row.total_payment !== result.total_payment;
	});
}

const UPDATE_FEES = "UPDATE pupil_enrollments SET fee_base = ?, evaluation_fee = ?, total_payment = ? WHERE id = ?";

/**
 * Recalculates the given pupil-years (FEES.md §3, "When it runs") and writes the changed rows in one
 * `db.batch`. Manual and unpinned rows are never written. Returns the number of rows updated.
 */
export async function recalculatePupilYears(pairs: readonly PupilYear[]): Promise<number> {
	const unique = [...new Map(pairs.map((pair) => [keyOf(pair), pair])).values()];
	const years = await Promise.all(unique.map(loadPupilYear));
	const catalogs = await loadCatalogs(years.flat().map((row) => row.fee_catalog_id));
	const updates = years.flatMap((rows) => changedFees(rows, computeYearFees(rows, catalogs)));
	if (updates.length === 0) return 0;

	const db = getDb();
	const args = updates.map((u) => [u.fee_base, u.evaluation_fee, u.total_payment, u.id]);
	await db.batch(args.map((values) => db.prepare(UPDATE_FEES).bind(...values)));
	for (const values of args) await logQuery(UPDATE_FEES, values);
	return updates.length;
}

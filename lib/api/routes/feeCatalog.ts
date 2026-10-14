import type { SysUsers } from "@_types/entities";
import { z_FeeCatalog, z_FeeCatalogData, z_SchoolYear } from "@lib/fees";
import { getActiveCatalog, getCatalogVersions, parseCatalogRow } from "@lib/fees/recalculate.server";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIError } from "./APIError";
import { APIServer, handlerResult } from "./APIServer";
import { COOKIE } from "./cookies";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * FeeCatalog — the versioned price catalog of the automatic fees (docs/FEES.md §2).
 *
 * Rows are immutable: `create` inserts a new version, and the ACTIVE catalog of a school year is its newest
 * version. Enrollments pin the version that was active when they were registered, so a new version never
 * changes existing enrollments.
 */

const z_CatalogCreate = z.object({
	school_year: z_SchoolYear,
	data: z_FeeCatalogData,
});

export const feeCatalogRoutes = {
	/** School years that have a catalog, newest first. */
	getYears: new APIServer({ method: "GET", path: "/fee-catalogs", responseSchema: z.array(z.string()) }, [authenticateMiddleware], () =>
		handlerResult(async () => {
			const rows = await executeQuery<{ school_year: string }>("SELECT DISTINCT school_year FROM fee_catalogs ORDER BY school_year DESC");
			return rows.map((row) => row.school_year);
		}, "Σφάλμα κατά την ανάκτηση των καταλόγων διδάκτρων"),
	),

	/** The active (newest) catalog of a school year, or null when the year has none. */
	getActive: new APIServer(
		{ method: "GET", path: "/fee-catalogs/[school_year:string]", responseSchema: z_FeeCatalog.nullable() },
		[authenticateMiddleware],
		({ params }) => handlerResult(() => getActiveCatalog(params.school_year), "Σφάλμα κατά την ανάκτηση του καταλόγου διδάκτρων"),
	),

	/** Every version of a school year's catalog, newest first (the first one is the active catalog). */
	getVersions: new APIServer(
		{ method: "GET", path: "/fee-catalogs/[school_year:string]/versions", responseSchema: z.array(z_FeeCatalog) },
		[authenticateMiddleware],
		({ params }) => handlerResult(() => getCatalogVersions(params.school_year), "Σφάλμα κατά την ανάκτηση των εκδόσεων του καταλόγου"),
	),

	/** Saves a new version of a school year's catalog (it becomes the active one). Returns the new row. */
	create: new APIServer(
		{ method: "POST", path: "/fee-catalogs", schema: z_CatalogCreate, responseSchema: z_FeeCatalog },
		[authenticateMiddleware],
		({ body, cookies }) =>
			handlerResult(async (T) => {
				const teacherIds = Object.keys(body.data.byzantine.teachers).map(Number);
				if (teacherIds.length > 0) {
					const found = await executeQuery<{ id: number }>(`SELECT id FROM teachers WHERE id IN (${questionMarks(teacherIds)})`, teacherIds);
					const known = new Set(found.map((row) => row.id));
					const missing = teacherIds.filter((id) => !known.has(id));
					if (missing.length > 0) throw APIError.badRequest(`Άγνωστος καθηγητής στον κατάλογο (id ${missing.join(", ")})`);
				}
				const [user] = await executeQuery<Pick<SysUsers, "email">>("SELECT email FROM sys_users WHERE session_id = ? LIMIT 1", [
					cookies.get(COOKIE.sessionId),
				]);
				const { insertId } = await T.executeQuery("INSERT INTO fee_catalogs (school_year, data, created_at, created_by) VALUES (?, ?, ?, ?)", [
					body.school_year,
					JSON.stringify(body.data),
					Date.now(),
					user?.email ?? null,
				]);
				const [row] = await executeQuery<Parameters<typeof parseCatalogRow>[0]>("SELECT * FROM fee_catalogs WHERE id = ?", [insertId]);
				const catalog = row && parseCatalogRow(row);
				if (!catalog) throw new Error("fee catalog insert could not be read back");
				return catalog;
			}, "Σφάλμα κατά την αποθήκευση του καταλόγου διδάκτρων"),
	),
};

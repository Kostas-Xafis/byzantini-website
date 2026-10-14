import type { SysUsers } from "@_types/entities";
import { getDb, logQuery } from "@lib/db";
import { z_FeeCatalog, z_FeeCatalogInput, z_SchoolYear } from "@lib/fees";
import { getActiveCatalog, getCatalog, getCatalogVersions } from "@lib/fees/recalculate.server";
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

/** `{ school_year, evaluation_fee, multi_enrollment_factor, rules }` — rules validated for ambiguity. */
const z_CatalogCreate = z_FeeCatalogInput.extend({ school_year: z_SchoolYear });

// `data` is the legacy JSON column of migration 0006 (NOT NULL, never read since 0007): new versions store '{}'.
const INSERT_CATALOG =
	"INSERT INTO fee_catalogs (school_year, data, evaluation_fee, multi_enrollment_factor, created_at, created_by) VALUES (?, '{}', ?, ?, ?, ?) RETURNING id";
// Inside the batch (one implicit transaction) the newest catalog row is the one just inserted.
const INSERT_RULE =
	"INSERT INTO fee_catalog_rules (catalog_id, class_id, class_years, teacher_id, price) VALUES ((SELECT MAX(id) FROM fee_catalogs), ?, ?, ?, ?)";

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
			handlerResult(async () => {
				const teacherIds = [...new Set(body.rules.map((rule) => rule.teacher_id).filter((id): id is number => id !== null))];
				if (teacherIds.length > 0) {
					const found = await executeQuery<{ id: number }>(`SELECT id FROM teachers WHERE id IN (${questionMarks(teacherIds)})`, teacherIds);
					const known = new Set(found.map((row) => row.id));
					const missing = teacherIds.filter((id) => !known.has(id));
					if (missing.length > 0) throw APIError.badRequest(`Άγνωστος καθηγητής στον κατάλογο (id ${missing.join(", ")})`);
				}
				const [user] = await executeQuery<Pick<SysUsers, "email">>("SELECT email FROM sys_users WHERE session_id = ? LIMIT 1", [
					cookies.get(COOKIE.sessionId),
				]);
				// The catalog and its rules in one batch: a version is never stored without its rules.
				const catalogArgs = [body.school_year, body.evaluation_fee, body.multi_enrollment_factor, Date.now(), user?.email ?? null];
				const ruleArgs = body.rules.map((rule) => [
					rule.class_id,
					rule.class_years ? JSON.stringify(rule.class_years) : null,
					rule.teacher_id,
					rule.price,
				]);
				const db = getDb();
				const [inserted] = await db.batch<{ id: number }>([
					db.prepare(INSERT_CATALOG).bind(...catalogArgs),
					...ruleArgs.map((args) => db.prepare(INSERT_RULE).bind(...args)),
				]);
				await logQuery(INSERT_CATALOG, catalogArgs);
				for (const args of ruleArgs) await logQuery(INSERT_RULE, args);
				const id = inserted?.results?.[0]?.id;
				const catalog = id ? await getCatalog(id) : null;
				if (!catalog) throw new Error("fee catalog insert could not be read back");
				return catalog;
			}, "Σφάλμα κατά την αποθήκευση του καταλόγου διδάκτρων"),
	),
};

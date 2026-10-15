import { z_IdArray, z_SysError } from "@lib/api/schemas";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware, requirePermission } from "./middleware/authenticate";

/**
 * «Σφάλματα» (sysadmin): the unexpected server errors recorded by `lib/errors/record.server.ts`, newest first.
 * The sysadmin is also emailed a digest by the emails worker's cron (services/emailWorker/src/errorDigest.ts).
 */
export const errorsRoutes = {
	list: new APIServer(
		{ method: "GET", path: "/sys/errors", responseSchema: z.array(z_SysError) },
		[authenticateMiddleware, requirePermission("queryLogs")],
		() =>
			handlerResult(
				() =>
					executeQuery<z.infer<typeof z_SysError>>(
						"SELECT id, source, status, error_name, message, host, count, first_seen_at, last_seen_at, notified_at FROM sys_errors ORDER BY last_seen_at DESC LIMIT 200",
					),
				"Σφάλμα κατά την ανάκτηση των σφαλμάτων",
			),
	),
	/** «Διαγραφή» once an error is dealt with (it comes back as a new row if it happens again). */
	delete: new APIServer({ method: "DELETE", path: "/sys/errors", schema: z_IdArray }, [authenticateMiddleware, requirePermission("queryLogs")], ({ body }) =>
		handlerResult(async () => {
			await executeQuery(`DELETE FROM sys_errors WHERE id IN (${questionMarks(body)})`, body);
			return body.length === 1 ? "Το σφάλμα διαγράφηκε" : "Τα σφάλματα διαγράφηκαν";
		}, "Σφάλμα κατά τη διαγραφή των σφαλμάτων"),
	),
};

/**
 * `GET /api/health` — for the external uptime monitor (docs/ERROR_ALERTING.md): 200 when the worker runs and D1
 * answers, 503 otherwise. Public, no data in the answer.
 */
export const healthRoutes = {
	get: new APIServer({ method: "GET", path: "/health", responseSchema: z.object({ ok: z.literal(true) }) }, [], async () => {
		try {
			await executeQuery("SELECT 1");
			return APIServer.jsonData({ ok: true as const });
		} catch (error) {
			console.error("[health] database check failed", error);
			return APIServer.jsonError("Η βάση δεδομένων δεν απαντά", 503);
		}
	}),
};

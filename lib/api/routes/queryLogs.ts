import { z } from "astro/zod";
import type { QueryLogs } from "@_types/entities";
import { executeQuery } from "@lib/utils.server";
import { z_QueryLogs } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * QueryLogs — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/queryLogs.client|server.ts.
 */

const v_QueryLogsFilters = z.object({
	startDate: z.number().int().min(0, "Μη έγκυρη ημερομηνία έναρξης").nullable().optional(),
	endDate: z.number().int().min(0, "Μη έγκυρη ημερομηνία λήξης").nullable().optional(),
	limit: z.number().int().min(1, "Μη έγκυρο πλήθος αποτελεσμάτων"),
});

export const queryLogsRoutes = {
	get: new APIServer({ method: "GET", path: "/query-logs", responseSchema: z.array(z_QueryLogs) }, [authenticateMiddleware], () =>
		handlerResult(
			() => executeQuery<QueryLogs>("SELECT id, query, args, date, error FROM query_logs ORDER BY date DESC LIMIT 100"),
			"Σφάλμα κατά την ανάκτηση των καταγραφών ερωτημάτων",
		),
	),
	getByFilters: new APIServer(
		{ method: "POST", path: "/query-logs/filter", schema: v_QueryLogsFilters, responseSchema: z.array(z_QueryLogs) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const { startDate = null, endDate = null, limit } = body;

				if (startDate !== null && endDate !== null && startDate >= endDate) {
					throw new Error("Η ημερομηνία έναρξης πρέπει να είναι πριν από την ημερομηνία λήξης");
				}

				const conditions: string[] = [];
				const args: number[] = [];

				if (startDate !== null) {
					conditions.push("date >= ?");
					args.push(startDate);
				}

				if (endDate !== null) {
					conditions.push("date < ?");
					args.push(endDate);
				}

				const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
				args.push(limit);

				return executeQuery<QueryLogs>(`SELECT id, query, args, date, error FROM query_logs${whereClause} ORDER BY date DESC LIMIT ?`, args);
			}, "Σφάλμα κατά την ανάκτηση των καταγραφών ερωτημάτων"),
	),
};

import type { QueryLogs } from "@_types/entities";
import { deepCopy } from "@utilities/objects";
import { execTryCatch, executeQuery, getUsedBody } from "../utils.server";
import { QueryLogsRoutes } from "./queryLogs.client";

const serverRoutes = deepCopy(QueryLogsRoutes);

serverRoutes.get.func = () => {
    return execTryCatch(
        () =>
            executeQuery<QueryLogs>(
                "SELECT id, query, args, date, error FROM query_logs ORDER BY date DESC LIMIT 100",
            ),
        "Σφάλμα κατά την ανάκτηση των καταγραφών ερωτημάτων",
    );
};

serverRoutes.getByFilters.func = ({ ctx }) => {
    return execTryCatch(async () => {
        const body = (getUsedBody(ctx) || (await ctx.request.json())) as {
            startDate?: number | null;
            endDate?: number | null;
            limit: number;
        };
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

        return executeQuery<QueryLogs>(
            `SELECT id, query, args, date, error FROM query_logs${whereClause} ORDER BY date DESC LIMIT ?`,
            args,
        );
    }, "Σφάλμα κατά την ανάκτηση των καταγραφών ερωτημάτων");
};

export const QueryLogsServerRoutes = serverRoutes;
import { type QueryLogs } from "@_types/entities";
import type { EndpointRoute } from "@_types/routes";
import { integer, minValue, nullable, number, object, optional } from "valibot";

const get: EndpointRoute<"/query-logs", any, QueryLogs[]> = {
    authentication: true,
    method: "GET",
    path: "/query-logs",
    hasUrlParams: false,
    validation: undefined,
};

const v_QueryLogsFilters = object({
    startDate: optional(nullable(number("Μη έγκυρη ημερομηνία έναρξης", [integer(), minValue(0)]))),
    endDate: optional(nullable(number("Μη έγκυρη ημερομηνία λήξης", [integer(), minValue(0)]))),
    limit: number("Μη έγκυρο πλήθος αποτελεσμάτων", [integer(), minValue(1)]),
});

const getByFilters: EndpointRoute<"/query-logs/filter", typeof v_QueryLogsFilters, QueryLogs[]> = {
    authentication: true,
    method: "POST",
    path: "/query-logs/filter",
    hasUrlParams: false,
    validation: () => v_QueryLogsFilters,
};

export const QueryLogsRoutes = {
    get,
    getByFilters,
};
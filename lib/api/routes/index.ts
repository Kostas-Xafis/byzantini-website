import { recordActivity } from "@lib/activity/record.server";
import { recordServerError } from "@lib/errors/record.server";
import { activityRoutes } from "./activity";
import { announcementsRoutes } from "./announcements";
import { authenticationRoutes } from "./authentication";
import { booksRoutes } from "./books";
import { emailSubscriptionsRoutes } from "./emailSubscriptions";
import { errorsRoutes, healthRoutes } from "./errors";
import { feeCatalogRoutes } from "./feeCatalog";
import { instrumentsRoutes } from "./instruments";
import { locationsRoutes } from "./locations";
import { paymentsRoutes } from "./payments";
import { payoffsRoutes } from "./payoffs";
import { pdfRoutes } from "./pdf";
import { pupilsRoutes } from "./pupils";
import { queryLogsRoutes } from "./queryLogs";
import { settingsBackupRoutes } from "./settingsBackup";
import { sysusersRoutes } from "./sysusers";
import { teachersRoutes } from "./teachers";
import { wholesalersRoutes } from "./wholesalers";
import type { APIEndpointNames, APIRouteInstance } from "../types";
import { APIServer } from "./APIServer";

/**
 * Route registry — SERVER ONLY.
 *
 * Every route group file (`./<group>.ts`) exports a `xxxRoutes` object of `APIServer` instances;
 * importing this module imports every group, which registers the routes for dispatch
 * (`APIServer.handle`).
 *
 * Browser code must never import this module (it carries the handlers, SQL and Zod schemas): it uses
 * the generated contract `lib/api/contract.ts` through `@routes/index.client`, and the types in
 * `lib/api/types.ts`, which derive from `routeGroups` with `import type` only. After adding, removing
 * or re-pathing a route run `bun run api:contract` (`tsc` and `bun run check` fail until you do).
 */
export const routeGroups = {
	Books: booksRoutes,
	Payments: paymentsRoutes,
	Payoffs: payoffsRoutes,
	Wholesalers: wholesalersRoutes,
	Teachers: teachersRoutes,
	Locations: locationsRoutes,
	Instruments: instrumentsRoutes,
	SysUsers: sysusersRoutes,
	QueryLogs: queryLogsRoutes,
	Pupils: pupilsRoutes,
	EmailSubscriptions: emailSubscriptionsRoutes,
	FeeCatalog: feeCatalogRoutes,
	PDF: pdfRoutes,
	Announcements: announcementsRoutes,
	SettingsBackup: settingsBackupRoutes,
	Authentication: authenticationRoutes,
	Activity: activityRoutes,
	Errors: errorsRoutes,
	Health: healthRoutes,
} as const;

/** Any registered route instance, whatever its generics. */
type AnyAPIServer = APIServer<any, any, any, any>;

// Every route learns its endpoint key (for the activity log), and successful changes are recorded.
for (const [group, routes] of Object.entries(routeGroups)) {
	for (const [name, route] of Object.entries(routes)) (route as AnyAPIServer).endpoint = `${group}.${name}`;
}
APIServer.afterWrite = recordActivity;
// Unexpected failures go to the «Σφάλματα» log (and from there to the sysadmin's digest).
APIServer.onServerError = ({ route, request, status, error }) =>
	recordServerError({ source: route.endpoint ?? `${route.method} ${route.path}`, status, error, host: new URL(request.url).host });

/**
 * Every registered route as `[endpoint key, instance]`, in registry order — what the client contract
 * generator (`scripts/apiContract.ts`) and its unit test read.
 */
export function routeEntries(): [APIEndpointNames, AnyAPIServer][] {
	return Object.entries(routeGroups).flatMap(([group, routes]) =>
		Object.entries(routes).map(([name, route]) => [`${group}.${name}` as APIEndpointNames, route as AnyAPIServer] as [APIEndpointNames, AnyAPIServer]),
	);
}

/** The `APIServer` instance (handler, Zod schemas, middleware) behind an endpoint key, e.g. `getRoute("Books.get")`. */
export function getRoute<N extends APIEndpointNames>(endpoint: N): APIRouteInstance<N> {
	const [group, name] = endpoint.split(".");
	return (routeGroups as unknown as Record<string, Record<string, AnyAPIServer>>)[group][name] as APIRouteInstance<N>;
}

export type { APIArgs, APIEndpointNames, APIResponse, APIRouteInstance } from "../types";

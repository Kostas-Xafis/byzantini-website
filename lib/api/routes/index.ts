import type { z } from "astro/zod";
import { announcementsRoutes } from "./announcements";
import { authenticationRoutes } from "./authentication";
import { booksRoutes } from "./books";
import { instrumentsRoutes } from "./instruments";
import { locationsRoutes } from "./locations";
import { paymentsRoutes } from "./payments";
import { payoffsRoutes } from "./payoffs";
import { queryLogsRoutes } from "./queryLogs";
import { registrationsRoutes } from "./registrations";
import { schemaRoutes } from "./schema";
import { settingsBackupRoutes } from "./settingsBackup";
import { sysusersRoutes } from "./sysusers";
import { teachersRoutes } from "./teachers";
import { wholesalersRoutes } from "./wholesalers";
import type { RouteParams } from "./APIClient";

/**
 * Route registry — Phase 4.
 *
 * Every route group file (`./<group>.ts`) exports a `xxxRoutes` object of
 * `APIServer` instances. This module:
 * 1. imports every group (which registers the routes for dispatch), and
 * 2. builds the app-facing compat maps (`API`, `APIEndpoints`) + types
 *    (`APIEndpointNames`, `APIArgs`, `APIResponse`) with the SAME keys as the
 *    old `lib/routes/index.client.ts`, so components and `useAPI` keep working.
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
	Registrations: registrationsRoutes,
	Announcements: announcementsRoutes,
	Schema: schemaRoutes,
	SettingsBackup: settingsBackupRoutes,
	Authentication: authenticationRoutes,
} as const;

type GroupName = keyof typeof routeGroups;

export const API = {} as { [G in GroupName]: { [K in keyof (typeof routeGroups)[G]]: `${G & string}.${K & string}` } };
export const APIEndpoints = {} as Record<string, RouteMeta>;

interface RouteMeta {
	method: string;
	path: string;
	endpoint: string;
	hasUrlParams: boolean;
	multipart: boolean;
	validation?: z.ZodTypeAny;
	responseSchema?: z.ZodTypeAny;
}

for (const [group, routes] of Object.entries(routeGroups) as [string, Record<string, any>][]) {
	(API as any)[group] = {};
	for (const [name, route] of Object.entries(routes)) {
		const endpoint = `${group}.${name}`;
		(API as any)[group][name] = endpoint;
		APIEndpoints[endpoint] = {
			method: route.method,
			path: route.path,
			endpoint,
			hasUrlParams: route.path.includes("["),
			multipart: route.multipart,
			validation: route.schema,
			responseSchema: route.responseSchema,
		};
	}
	// Ensure all routes are registered for dispatch (side-effect free apart from registration)
	for (const route of Object.values(routes)) {
		void route;
	}
}

/**
 * Types derive from `routeGroups` directly (per-instance generics are
 * preserved) — NOT from the erased RouteMeta, so APIArgs/APIResponse keep full
 * fidelity like the old `types/routes.ts` machinery.
 */
type EndpointNameOf<G, Mount extends string> = { [K in keyof G]: `${Mount}.${K & string}` }[keyof G];
type EndpointName = { [G in keyof typeof routeGroups]: EndpointNameOf<(typeof routeGroups)[G], G & string> }[keyof typeof routeGroups] & string;

type InstanceOf<N extends string> = N extends `${infer G}.${infer K}`
	? G extends keyof typeof routeGroups
		? K extends keyof (typeof routeGroups)[G]
			? (typeof routeGroups)[G][K]
			: never
		: never
	: never;

export type APIEndpointNames = EndpointName;

type IsUrlParamPath<P> = P extends `${string}[${string}]${string}` ? true : false;

type SchemaOf<N extends string> = NonNullable<InstanceOf<N>["schema"]>;
type ResponseOf<N extends string> = NonNullable<InstanceOf<N>["responseSchema"]>;

export type APIArgs = {
	[N in EndpointName]: ([SchemaOf<N>] extends [never] ? {} : { RequestObject: z.infer<SchemaOf<N>> }) &
		(InstanceOf<N>["path"] extends infer P
			? P extends string
				? IsUrlParamPath<P> extends true
					? { UrlArgs: RouteParams<P> }
					: {}
				: {}
			: {});
};

export type APIResponse = {
	[N in EndpointName]: [ResponseOf<N>] extends [never] ? unknown : z.infer<ResponseOf<N>>;
};

export const BaseRoutes = Object.fromEntries(Object.keys(routeGroups).map((g) => [g, g])) as { [G in GroupName]: G };

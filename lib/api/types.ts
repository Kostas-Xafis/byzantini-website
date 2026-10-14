/**
 * Type-only view of the API route registry.
 *
 * Every type here is derived from the server registry (`lib/api/routes`) through `import type`, which
 * `verbatimModuleSyntax` erases: browser code can use these types without pulling a single handler,
 * SQL string or Zod schema into its bundle. NEVER add a value import to this module.
 *
 * It also holds the compile-time drift check between the generated client contract
 * (`lib/api/contract.ts`) and the registry — see the bottom of the file.
 */
import type { z } from "astro/zod";
import type { APIEndpoints } from "./contract";
import type { routeGroups } from "./routes";
import type { HTTPMethod, RouteParams } from "./routes/APIRoute";

type RouteGroups = typeof routeGroups;
type GroupName = keyof RouteGroups;

type EndpointNameOf<G, Mount extends string> = { [K in keyof G]: `${Mount}.${K & string}` }[keyof G];

/** Every endpoint key, e.g. `"Books.get"`. */
export type APIEndpointNames = { [G in GroupName]: EndpointNameOf<RouteGroups[G], G & string> }[GroupName] & string;

/** The `APIServer` instance behind an endpoint key (type level only — per-instance generics are preserved). */
export type APIRouteInstance<N extends string> = N extends `${infer G}.${infer K}`
	? G extends GroupName
		? K extends keyof RouteGroups[G]
			? RouteGroups[G][K]
			: never
		: never
	: never;

/** `API.Books.get === "Books.get"` — the name map the app uses to spell endpoint keys. */
export type APINameMap = { [G in GroupName]: { [K in keyof RouteGroups[G]]: `${G & string}.${K & string}` } };

/** Browser-safe metadata of one route: what a client needs to build the request, nothing more. */
export interface APIContractEntry {
	method: HTTPMethod;
	path: string;
	/** The body is sent as `FormData` (values coerced server-side). */
	multipart: boolean;
	/** The body IS the raw file (`Blob`). */
	rawBlob: boolean;
}

type IsUrlParamPath<P> = P extends `${string}[${string}]${string}` ? true : false;

type SchemaOf<N extends string> = NonNullable<APIRouteInstance<N>["schema"]>;
type ResponseOf<N extends string> = NonNullable<APIRouteInstance<N>["responseSchema"]>;

/** Per endpoint: `{ RequestObject }` when it has a request schema, `{ UrlArgs }` when its path has `[params]`. */
export type APIArgs = {
	[N in APIEndpointNames]: ([SchemaOf<N>] extends [never] ? {} : { RequestObject: z.infer<SchemaOf<N>> }) &
		(APIRouteInstance<N>["path"] extends infer P ? (P extends string ? (IsUrlParamPath<P> extends true ? { UrlArgs: RouteParams<P> } : {}) : {}) : {});
};

/** Per endpoint: the `data` payload type (from its `responseSchema`, `unknown` without one). */
export type APIResponse = {
	[N in APIEndpointNames]: [ResponseOf<N>] extends [never] ? unknown : z.infer<ResponseOf<N>>;
};

// ---------------------------------------------------------------------------
// Contract drift check (compile time)
//
// The key set is checked where the contract is declared (`satisfies Record<APIEndpointNames, …>`).
// Here every entry's `method`/`path` literal must equal the server instance's; on drift `tsc` fails
// with the offending endpoint key(s) in the message ("Type '"Books.get"' does not satisfy the
// constraint 'never'"). Fix: `bun run api:contract`. `multipart`/`rawBlob` are plain booleans on the
// instances, so the unit test `tests/unit/apiContract.test.ts` compares those at runtime.
// ---------------------------------------------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The contract entry of an endpoint; `never` when the key is missing (also reported as drift, without index errors). */
type ContractEntryOf<N> = N extends keyof typeof APIEndpoints ? (typeof APIEndpoints)[N] : never;

type ContractDrift = {
	[N in APIEndpointNames]: Same<ContractEntryOf<N>["method"], APIRouteInstance<N>["method"]> extends true
		? Same<ContractEntryOf<N>["path"], APIRouteInstance<N>["path"]> extends true
			? never
			: N
		: N;
}[APIEndpointNames];

type AssertNoContractDrift<Drifted extends never> = Drifted;
export type ContractInSync = AssertNoContractDrift<ContractDrift>;

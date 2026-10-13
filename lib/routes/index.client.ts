/**
 * Stable, browser-safe import path for the internal API.
 *
 * - `APIEndpoints` — the generated contract (`lib/api/contract.ts`): method, path, multipart, rawBlob.
 * - `API` — endpoint keys by group (`API.Books.get === "Books.get"`).
 * - `APIEndpointNames` / `APIArgs` / `APIResponse` — type-only, derived from the server registry.
 *
 * Nothing here reaches the server registry at runtime. Server code that needs the route instances
 * (handlers, Zod schemas) imports `@lib/api/routes` instead.
 */
import { APIEndpoints } from "@lib/api/contract";
import type { APINameMap } from "@lib/api/types";

export { APIEndpoints };
export type { APIArgs, APIContractEntry, APIEndpointNames, APIResponse } from "@lib/api/types";

export const API = {} as APINameMap;
for (const endpoint of Object.keys(APIEndpoints)) {
	const [group, name] = endpoint.split(".");
	((API as Record<string, Record<string, string>>)[group] ??= {})[name] = endpoint;
}

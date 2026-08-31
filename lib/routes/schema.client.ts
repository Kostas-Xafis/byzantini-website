import type { EndpointRoute } from "@_types/routes";

/**
 * NOTE (Phase 3): `revertToPreviousSchema` / `migrate` were retired — they were
 * fs + connector based and do not exist under the Workers runtime.
 * `wrangler d1 migrations` is the replacement.
 */

const get: EndpointRoute<'/schema/backup/[type:"mysql" | "sqlite"]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/schema/backup/[type:"mysql" | "sqlite"]',
	hasUrlParams: true,
	validation: undefined,
};

export const SchemaRoutes = {
	get,
};

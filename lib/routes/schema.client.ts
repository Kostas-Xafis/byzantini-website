import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<'/schema/backup/[type:"mysql" | "sqlite"]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/schema/backup/[type:"mysql" | "sqlite"]',
	hasUrlParams: true,
	validation: undefined,
};

const revertToPreviousSchema: EndpointRoute<'/schema/revert/[type:"mysql" | "sqlite"]', null> = {
	authentication: true,
	method: "GET",
	path: '/schema/revert/[type:"mysql" | "sqlite"]',
	hasUrlParams: true,
	validation: undefined,
};

const migrate: EndpointRoute<'/schema/migrate', null> = {
	authentication: true,
	method: "GET",
	path: '/schema/migrate',
	hasUrlParams: false,
	validation: undefined,
};

export const SchemaRoutes = {
	get,
	revertToPreviousSchema,
	migrate
};

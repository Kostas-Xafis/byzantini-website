import type { EndpointRoute } from "../../types/routes";

const replication: EndpointRoute<'/replication/[service:"bucket" | "database" | "database-force" | "both"]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/replication/[service:"bucket" | "database" | "database-force" | "both"]',
	hasUrlParams: true,
	validation: undefined,
};

export const ReplicationRoutes = {
	replication,
};

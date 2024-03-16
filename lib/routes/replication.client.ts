import type { EndpointRoute } from "../../types/routes";

const replication: EndpointRoute<'/replication/[service:"bucket" | "database" | "both"]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/replication/[service:"bucket" | "database" | "both"]',
	hasUrlParams: true,
	validation: undefined,
};

export const ReplicationRoutes = {
	replication,
};

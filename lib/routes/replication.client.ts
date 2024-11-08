import type { EndpointRoute } from "../../types/routes";

const replication: EndpointRoute<'/replication/[service:"bucket" | "database" | "database-force" | "both"]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/replication/[service:"bucket" | "database" | "database-force" | "both"]',
	hasUrlParams: true,
	validation: undefined,
};

const replicationByDate: EndpointRoute<'/replication/date/[date:string]', null, string> = {
	authentication: true,
	method: "GET",
	path: '/replication/date/[date:string]',
	hasUrlParams: true,
	validation: undefined,
};

export const ReplicationRoutes = {
	replication,
	replicationByDate,
};

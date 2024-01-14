import type { EndpointRoute } from "../../types/routes";

const replication: EndpointRoute<"/replication/[service:string]"> = {
	authentication: true,
	method: "GET",
	path: "/replication/[service:string]",
	hasUrlParams: true,
	validation: undefined,
};

export const ReplicationRoutes = {
	replication,
};

import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/schema/[type:string]", null, string> = {
	authentication: true,
	method: "GET",
	path: "/schema/[type:string]",
	hasUrlParams: true,
	validation: undefined,
};


export const SchemaRoutes = {
	get,
};

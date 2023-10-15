import type { APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder, EndpointRoute } from "../../types/routes";

const execute: EndpointRoute<"GET:/special/[func:string]", null> = {
	authentication: true,
	method: "GET",
	path: "/special/[func:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};

export const SpecialRoutes = {
	execute,
};

export type APISpecialArgs = APIArguments<"Special", typeof SpecialRoutes>;

export type APISpecialResponse = APIResponse<"Special", typeof SpecialRoutes>;

export const APISpecialEndpoints: APIEndpointsBuilder<"Special", typeof SpecialRoutes> = {
	"Special.execute": {
		method: "GET",
		path: "/special/[func:string]",
		endpoint: "Special.execute"
	}
};

export const APISpecial: APIBuilder<"Special", typeof SpecialRoutes> = {
	Special: {
		execute: "Special.execute",
	}
};

import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { z_ClassType, type ClassType } from "../../types/entities";

const get: EndpointRoute<"GET:/classtype", null, ClassType[]> = {
	authentication: true,
	method: "GET",
	path: "/classtype",
	hasUrlParams: false,
	func: async req => null as any
};

let postReq = z_ClassType.omit({ id: true });
const post: EndpointRoute<"POST:/classtype", typeof postReq, { insertId: number }> = {
	authentication: true,
	method: "POST",
	path: "/classtype",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/classtype", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/classtype",
	hasUrlParams: false,
	func: async req => null as any
};

export const ClassTypeRoutes = {
	get,
	post,
	delete: del
};

export type APIClassTypeArgs = APIArguments<"ClassType", typeof ClassTypeRoutes>;

export type APIClassTypeResponse = APIResponse<"ClassType", typeof ClassTypeRoutes>;

export const APIClassTypeEndpoints: APIEndpointsBuilder<"ClassType", typeof ClassTypeRoutes> = {
	"ClassType.get": {
		method: "GET",
		path: "/classtype",
		endpoint: "ClassType.get"
	},
	"ClassType.post": {
		method: "POST",
		path: "/classtype",
		endpoint: "ClassType.post",
		validation: postReq
	},
	"ClassType.delete": {
		method: "DELETE",
		path: "/classtype",
		endpoint: "ClassType.delete"
	}
};

export const APIClassType: APIBuilder<"ClassType", typeof ClassTypeRoutes> = {
	ClassType: {
		get: "ClassType.get",
		post: "ClassType.post",
		delete: "ClassType.delete"
	}
};

import { type Wholesalers, v_Wholesalers } from "../../types/entities";
import type { APIArguments, APIBuilder, APIEndpointsBuilder, APIResponse, EndpointRoute } from "../../types/routes";
import { omit } from "valibot";

const get: EndpointRoute<"/wholesalers", null, Wholesalers[]> = {
	authentication: true,
	method: "GET",
	path: "/wholesalers",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"/wholesalers/id", number[], Wholesalers> = {
	authentication: true,
	method: "POST",
	path: "/wholesalers/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const postReq = omit(v_Wholesalers, ["id"]);
const post: EndpointRoute<"/wholesalers", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/wholesalers",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};
const remove: EndpointRoute<"/wholesalers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/wholesalers",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const WholesalersRoutes = { get, post, getById, delete: remove };

export type APIWholesalersArgs = APIArguments<"Wholesalers", typeof WholesalersRoutes>;

export type APIWholesalersResponse = APIResponse<"Wholesalers", typeof WholesalersRoutes>;

export const APIWholesalersEndpoints: APIEndpointsBuilder<"Wholesalers", typeof WholesalersRoutes> = {
	"Wholesalers.get": {
		method: "GET",
		path: "/wholesalers",
		endpoint: "Wholesalers.get"
	},
	"Wholesalers.getById": {
		method: "POST",
		path: "/wholesalers/id",
		endpoint: "Wholesalers.getById"
	},
	"Wholesalers.post": {
		method: "POST",
		path: "/wholesalers",
		endpoint: "Wholesalers.post",
		validation: postReq
	},
	"Wholesalers.delete": {
		method: "DELETE",
		path: "/wholesalers",
		endpoint: "Wholesalers.delete"
	}
};

export const APIWholesalers: APIBuilder<"Wholesalers", typeof WholesalersRoutes> = {
	Wholesalers: {
		get: "Wholesalers.get",
		getById: "Wholesalers.getById",
		post: "Wholesalers.post",
		delete: "Wholesalers.delete"
	}
};

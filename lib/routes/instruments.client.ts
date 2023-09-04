import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Instruments, type Instruments } from "../../types/entities";
import { omit } from "valibot";

const get: EndpointRoute<"GET:/instruments", null, Instruments[]> = {
	authentication: false,
	method: "GET",
	path: "/instruments",
	hasUrlParams: false,
	func: async ctx => null as any
};

let postReq = omit(v_Instruments, ["id"]);
const post: EndpointRoute<"POST:/instruments", typeof postReq, { insertId: number }> = {
	authentication: true,
	method: "POST",
	path: "/instruments",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

const del: DefaultEndpointRoute<"DELETE:/instruments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/instruments",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const InstrumentsRoutes = {
	get,
	post,
	delete: del
};

export type APIInstrumentsArgs = APIArguments<"Instruments", typeof InstrumentsRoutes>;

export type APIInstrumentsResponse = APIResponse<"Instruments", typeof InstrumentsRoutes>;

export const APIInstrumentsEndpoints: APIEndpointsBuilder<"Instruments", typeof InstrumentsRoutes> = {
	"Instruments.get": {
		method: "GET",
		path: "/instruments",
		endpoint: "Instruments.get"
	},
	"Instruments.post": {
		method: "POST",
		path: "/instruments",
		endpoint: "Instruments.post",
		validation: postReq
	},
	"Instruments.delete": {
		method: "DELETE",
		path: "/instruments",
		endpoint: "Instruments.delete"
	}
};

export const APIInstruments: APIBuilder<"Instruments", typeof InstrumentsRoutes> = {
	Instruments: {
		get: "Instruments.get",
		post: "Instruments.post",
		delete: "Instruments.delete"
	}
};

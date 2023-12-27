import { v_Payoffs, type Payoffs, type Wholesalers } from "../../types/entities";
import type { APIArguments, APIBuilder, APIEndpointsBuilder, APIResponse, EndpointRoute } from "../../types/routes";
import { pick } from "valibot";

export type PayoffGetResponse = Pick<Payoffs, "wholesaler_id" | "amount"> & Pick<Wholesalers, "id">;

const get: EndpointRoute<"/payoffs", null, PayoffGetResponse[]> = {
	authentication: true,
	method: "GET",
	path: "/payoffs",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"/payoffs/id", number[], Payoffs[]> = {
	authentication: true,
	method: "POST",
	path: "/payoffs/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getTotal: EndpointRoute<"/payoffs/total", null, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payoffs/total",
	hasUrlParams: false,
	func: async ctx => null as any
};

let updateAmountReq = pick(v_Payoffs, ["id", "amount"]);
const updateAmount: EndpointRoute<"/payoffs", typeof updateAmountReq> = {
	authentication: true,
	method: "PUT",
	path: "/payoffs",
	hasUrlParams: false,
	validation: () => updateAmountReq,
	func: async ctx => null as any
};

const complete: EndpointRoute<"/payoffs", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payoffs",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const PayoffsRoutes = {
	get,
	getById,
	getTotal,
	updateAmount,
	complete
};

export type APIPayoffsArgs = APIArguments<"Payoffs", typeof PayoffsRoutes>;

export type APIPayoffsResponse = APIResponse<"Payoffs", typeof PayoffsRoutes>;

export const APIPayoffsEndpoints: APIEndpointsBuilder<"Payoffs", typeof PayoffsRoutes> = {
	"Payoffs.get": {
		method: "GET",
		path: "/payoffs",
		endpoint: "Payoffs.get"
	},
	"Payoffs.getById": {
		method: "POST",
		path: "/payoffs/id",
		endpoint: "Payoffs.getById"
	},
	"Payoffs.getTotal": {
		method: "GET",
		path: "/payoffs/total",
		endpoint: "Payoffs.getTotal"
	},
	"Payoffs.updateAmount": {
		method: "PUT",
		path: "/payoffs",
		endpoint: "Payoffs.updateAmount",
		validation: updateAmountReq
	},
	"Payoffs.complete": {
		method: "DELETE",
		path: "/payoffs",
		endpoint: "Payoffs.complete"
	}
};

export const APIPayoffs: APIBuilder<"Payoffs", typeof PayoffsRoutes> = {
	Payoffs: {
		get: "Payoffs.get",
		getById: "Payoffs.getById",
		getTotal: "Payoffs.getTotal",
		updateAmount: "Payoffs.updateAmount",
		complete: "Payoffs.complete"
	}
};

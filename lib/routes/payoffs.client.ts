import { v_SchoolPayoffs, type SchoolPayoffs, type Wholesalers } from "../../types/entities";
import type { APIArguments, APIBuilder, APIEndpointsBuilder, APIResponse, EndpointRoute } from "../../types/routes";
import { pick } from "valibot";

export type PayoffGetResponse = Pick<SchoolPayoffs, "wholesaler_id" | "amount"> & Pick<Wholesalers, "id">;

const get: EndpointRoute<"GET:/payoffs", null, PayoffGetResponse[]> = {
	authentication: true,
	method: "GET",
	path: "/payoffs",
	hasUrlParams: false,
	func: async req => null as any
};

let updateAmountReq = pick(v_SchoolPayoffs, ["id", "amount"]);
const updateAmount: EndpointRoute<"PUT:/payoffs", typeof updateAmountReq> = {
	authentication: true,
	method: "PUT",
	path: "/payoffs",
	hasUrlParams: false,
	validation: () => updateAmountReq,
	func: async req => null as any
};

const complete: EndpointRoute<"DELETE:/payoffs", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payoffs",
	hasUrlParams: false,
	func: async req => null as any
};

export const PayoffsRoutes = {
	get,
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
		updateAmount: "Payoffs.updateAmount",
		complete: "Payoffs.complete"
	}
};

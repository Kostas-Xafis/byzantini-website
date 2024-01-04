import { v_Payoffs, type Payoffs, type Wholesalers } from "../../types/entities";
import type { APIArguments, APIResponse, EndpointRoute } from "../../types/routes";
import { pick } from "valibot";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

export type PayoffGetResponse = Pick<Payoffs, "wholesaler_id" | "amount"> & Pick<Wholesalers, "id">;

const get: EndpointRoute<"/payoffs", null, PayoffGetResponse[]> = {
	authentication: true,
	method: "GET",
	path: "/payoffs",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/payoffs/id", number[], Payoffs[]> = {
	authentication: true,
	method: "POST",
	path: "/payoffs/id",
	hasUrlParams: false,
};

const getTotal: EndpointRoute<"/payoffs/total", null, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payoffs/total",
	hasUrlParams: false,
};

let updateAmountReq = pick(v_Payoffs, ["id", "amount"]);
const updateAmount: EndpointRoute<"/payoffs", typeof updateAmountReq> = {
	authentication: true,
	method: "PUT",
	path: "/payoffs",
	hasUrlParams: false,
	validation: () => updateAmountReq,
};

const complete: EndpointRoute<"/payoffs", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payoffs",
	hasUrlParams: false,
};

export const PayoffsRoutes = {
	get,
	getById,
	getTotal,
	updateAmount,
	complete,
};

export type APIPayoffsArgs = APIArguments<"Payoffs", typeof PayoffsRoutes>;

export type APIPayoffsResponse = APIResponse<"Payoffs", typeof PayoffsRoutes>;

export const APIPayoffsEndpoints = EndpointsConstructor("Payoffs", PayoffsRoutes);

export const APIPayoffs = APIBuilderConstructor("Payoffs", PayoffsRoutes);

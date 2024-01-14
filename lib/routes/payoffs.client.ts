import { v_Payoffs, type Payoffs, type Wholesalers } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";
import { pick } from "valibot";

export type PayoffGetResponse = Pick<Payoffs, "wholesaler_id" | "amount"> & Pick<Wholesalers, "id">;

const get: EndpointRoute<"/payoffs", any, PayoffGetResponse[]> = {
	authentication: true,
	method: "GET",
	path: "/payoffs",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/payoffs/id", number[], Payoffs[]> = {
	authentication: true,
	method: "POST",
	path: "/payoffs/id",
	hasUrlParams: false,
	validation: undefined,
};

const getTotal: EndpointRoute<"/payoffs/total", any, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payoffs/total",
	hasUrlParams: false,
	validation: undefined,
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
	validation: undefined,
};

export const PayoffsRoutes = {
	get,
	getById,
	getTotal,
	updateAmount,
	complete,
};

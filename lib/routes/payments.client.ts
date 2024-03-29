import { v_Payments, type Payments, type Insert } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";
import { omit, pick } from "valibot";

const get: EndpointRoute<"/payments", any, Payments[]> = {
	authentication: true,
	method: "GET",
	path: "/payments",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/payments/id", number[], Payments[]> = {
	authentication: true,
	method: "POST",
	path: "/payments/id",
	hasUrlParams: false,
	validation: undefined,
};

const getTotal: EndpointRoute<"/payments/total", any, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payments/total",
	hasUrlParams: false,
	validation: undefined,
};

let postReq = omit(v_Payments, ["id", "amount", "date"]);
const post: EndpointRoute<"/payments", typeof postReq, Insert> = {
	authentication: true,
	method: "POST",
	path: "/payments",
	hasUrlParams: false,
	validation: () => postReq,
};

let updatePaymentReq = pick(v_Payments, ["id", "amount"]);
const updatePayment: EndpointRoute<"/payments", typeof updatePaymentReq> = {
	authentication: true,
	method: "PUT",
	path: "/payments",
	hasUrlParams: false,
	validation: () => updatePaymentReq,
};
const complete: EndpointRoute<"/payments/complete", number[]> = {
	authentication: true,
	method: "POST",
	path: "/payments/complete",
	hasUrlParams: false,
	validation: undefined,
};

const del: EndpointRoute<"/payments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payments",
	hasUrlParams: false,
	validation: undefined,
};

export const PaymentsRoutes = {
	get,
	getById,
	getTotal,
	post,
	updatePayment,
	complete,
	delete: del
};

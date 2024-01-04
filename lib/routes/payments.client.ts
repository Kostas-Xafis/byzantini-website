import { omit, pick } from "valibot";
import { v_Payments, type Payments } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/payments", null, Payments[]> = {
	authentication: true,
	method: "GET",
	path: "/payments",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/payments/id", number[], Payments[]> = {
	authentication: true,
	method: "POST",
	path: "/payments/id",
	hasUrlParams: false,
};

const getTotal: EndpointRoute<"/payments/total", null, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payments/total",
	hasUrlParams: false,
};

let postReq = omit(v_Payments, ["id", "amount", "date"]);
const post: EndpointRoute<"/payments", typeof postReq, Payments> = {
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
};

const del: EndpointRoute<"/payments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payments",
	hasUrlParams: false,
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

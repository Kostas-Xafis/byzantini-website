import { v_Payments, type Payments } from "../../types/entities";
import { omit, pick } from "valibot";
import type { APIArguments, APIBuilder, APIEndpointsBuilder, APIResponse, EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"GET:/payments", null, Payments[]> = {
	authentication: true,
	method: "GET",
	path: "/payments",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getTotal: EndpointRoute<"GET:/payments/total", null, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/payments/total",
	hasUrlParams: false,
	func: async ctx => null as any
};

let postReq = omit(v_Payments, ["id", "amount", "date"]);
const post: EndpointRoute<"POST:/payments", typeof postReq, Payments> = {
	authentication: true,
	method: "POST",
	path: "/payments",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

let updatePaymentReq = pick(v_Payments, ["id", "amount"]);
const updatePayment: EndpointRoute<"PUT:/payments", typeof updatePaymentReq> = {
	authentication: true,
	method: "PUT",
	path: "/payments",
	hasUrlParams: false,
	validation: () => updatePaymentReq,
	func: async ctx => null as any
};
const complete: EndpointRoute<"POST:/payments/compelete", number[]> = {
	authentication: true,
	method: "POST",
	path: "/payments/compelete",
	hasUrlParams: false,
	func: async ctx => null as any
};

const del: EndpointRoute<"DELETE:/payments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payments",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const PaymentsRoutes = {
	get,
	getTotal,
	post,
	updatePayment,
	complete,
	delete: del
};

export type APIPaymentsArgs = APIArguments<"Payments", typeof PaymentsRoutes>;

export type APIPaymentsResponse = APIResponse<"Payments", typeof PaymentsRoutes>;

export const APIPaymentsEndpoints: APIEndpointsBuilder<"Payments", typeof PaymentsRoutes> = {
	"Payments.get": {
		method: "GET",
		path: "/payments",
		endpoint: "Payments.get"
	},
	"Payments.getTotal": {
		method: "GET",
		path: "/payments/total",
		endpoint: "Payments.getTotal"
	},
	"Payments.post": {
		method: "POST",
		path: "/payments",
		endpoint: "Payments.post",
		validation: postReq
	},
	"Payments.updatePayment": {
		method: "PUT",
		path: "/payments",
		endpoint: "Payments.updatePayment",
		validation: updatePaymentReq
	},
	"Payments.complete": {
		method: "POST",
		path: "/payments/compelete",
		endpoint: "Payments.complete"
	},
	"Payments.delete": {
		method: "DELETE",
		path: "/payments",
		endpoint: "Payments.delete"
	}
};

export const APIPayments: APIBuilder<"Payments", typeof PaymentsRoutes> = {
	Payments: {
		get: "Payments.get",
		getTotal: "Payments.getTotal",
		post: "Payments.post",
		updatePayment: "Payments.updatePayment",
		complete: "Payments.complete",
		delete: "Payments.delete"
	}
};

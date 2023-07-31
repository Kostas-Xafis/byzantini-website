import { z_Payments, type Payments } from "../../types/entities";
import type { APIArguments, APIBuilder, APIEndpointsBuilder, APIResponse, EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"GET:/payments", null, Payments[]> = {
	authentication: true,
	method: "GET",
	path: "/payments",
	hasUrlParams: false,
	func: async req => null as any
};

let postReq = z_Payments.omit({ id: true, amount: true, date: true });
const post: EndpointRoute<"POST:/payments", typeof postReq, Payments> = {
	authentication: true,
	method: "POST",
	path: "/payments",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

let updatePaymentReq = z_Payments.pick({ id: true, amount: true });
const updatePayment: EndpointRoute<"PUT:/payments", typeof updatePaymentReq> = {
	authentication: true,
	method: "PUT",
	path: "/payments",
	hasUrlParams: false,
	validation: () => updatePaymentReq,
	func: async req => null as any
};
const complete: EndpointRoute<"DELETE:/payments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/payments",
	hasUrlParams: false,
	func: async req => null as any
};

export const PaymentsRoutes = {
	get,
	post,
	updatePayment,
	complete
};

export type APIPaymentsArgs = APIArguments<"Payments", typeof PaymentsRoutes>;

export type APIPaymentsResponse = APIResponse<"Payments", typeof PaymentsRoutes>;

export const APIPaymentsEndpoints: APIEndpointsBuilder<"Payments", typeof PaymentsRoutes> = {
	"Payments.get": {
		method: "GET",
		path: "/payments",
		endpoint: "Payments.get"
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
		method: "DELETE",
		path: "/payments",
		endpoint: "Payments.complete"
	}
};

export const APIPayments: APIBuilder<"Payments", typeof PaymentsRoutes> = {
	Payments: {
		get: "Payments.get",
		post: "Payments.post",
		updatePayment: "Payments.updatePayment",
		complete: "Payments.complete"
	}
};

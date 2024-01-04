import { object, omit, string } from "valibot";
import { v_Registrations, type Registrations } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/registrations", null, Registrations[]> = {
	authentication: true,
	method: "GET",
	path: "/registrations",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/registrations/id", number[], Registrations> = {
	authentication: true,
	method: "POST",
	path: "/registrations/id",
	hasUrlParams: false,
};

const getTotal: EndpointRoute<"/registrations/total", null, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/registrations/total",
	hasUrlParams: false,
};

const postReq = omit(v_Registrations, [
	"id",
	"payment_amount",
	"payment_date",
	"payment_amount",
	"total_payment",
]);
const post: EndpointRoute<"/registrations", typeof postReq> = {
	authentication: false,
	method: "POST",
	path: "/registrations",
	hasUrlParams: false,
	validation: () => postReq,
};

const update: EndpointRoute<"/registrations", typeof v_Registrations> = {
	authentication: true,
	method: "PUT",
	path: "/registrations",
	hasUrlParams: false,
	validation: () => v_Registrations,
};

const del: EndpointRoute<"/registrations", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/registrations",
	hasUrlParams: false,
};

const v_Email = object({ email: string() });
const emailSubscribe: EndpointRoute<"/registrations/email-subscribe", typeof v_Email> = {
	authentication: false,
	method: "POST",
	path: "/registrations/email-subscribe",
	hasUrlParams: false,
	validation: () => v_Email,
};

const v_EmailToken = object({ token: string() });
const emailUnsubscribe: EndpointRoute<
	"/registrations/email-unsubscribe",
	typeof v_EmailToken,
	{ isValid: boolean; }
> = {
	authentication: false,
	method: "POST",
	path: "/registrations/email-unsubscribe",
	hasUrlParams: false,
	validation: () => v_EmailToken,
};

const getSubscriptionToken: EndpointRoute<
	"/registrations/email-subscribe/token",
	typeof v_Email,
	{ token: string | null; }
> = {
	authentication: false,
	method: "POST",
	path: "/registrations/email-subscribe/token",
	hasUrlParams: false,
	validation: () => v_Email,
};

export const RegistrationsRoutes = {
	get,
	getById,
	getTotal,
	post,
	update,
	delete: del,
	emailSubscribe,
	emailUnsubscribe,
	getSubscriptionToken,
};

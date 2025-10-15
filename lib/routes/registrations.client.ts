import { v_Registrations, type Insert, type Registrations } from "@_types/entities";
import type { EndpointRoute } from "@_types/routes";
import { object, omit, string } from "valibot";

const get: EndpointRoute<"/registrations/[year:number]", any, Registrations[]> = {
	authentication: true,
	method: "GET",
	path: "/registrations/[year:number]",
	hasUrlParams: true,
	validation: undefined,
};

const getById: EndpointRoute<"/registrations/[id:number]", null, Registrations> = {
	authentication: true,
	method: "POST",
	path: "/registrations/[id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const getByReregistrationUrl: EndpointRoute<"/registrations/reregistration/[url:string]", null, Registrations> = {
	authentication: false,
	method: "GET",
	path: "/registrations/reregistration/[url:string]",
	hasUrlParams: true,
	validation: undefined,
};

const getTotal: EndpointRoute<"/registrations/total", any, { total: number; }> = {
	authentication: true,
	method: "GET",
	path: "/registrations/total",
	hasUrlParams: false,
	validation: undefined,
};

const getTotalByYear: EndpointRoute<"/registrations/totalByYear", any, Record<number, number>> = {
	authentication: true,
	method: "GET",
	path: "/registrations/totalByYear",
	hasUrlParams: false,
	validation: undefined,
};

const postReq = omit(v_Registrations, [
	"id",
	"payment_date",
	"payment_amount",
	"total_payment",
]);
const post: EndpointRoute<"/registrations", typeof postReq, Insert> = {
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
	validation: undefined,
};

const v_Email = object({ email: string() });
const emailSubscribe: EndpointRoute<"/registrations/email-subscribe", typeof v_Email, { subscribed: boolean; }> = {
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
	getByReregistrationUrl,
	getTotal,
	getTotalByYear,
	post,
	update,
	delete: del,
	emailSubscribe,
	emailUnsubscribe,
	getSubscriptionToken,
};

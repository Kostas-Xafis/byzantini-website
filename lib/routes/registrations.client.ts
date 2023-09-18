import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Registrations, type Registrations } from "../../types/entities";
import { object, omit, string } from "valibot";

const get: EndpointRoute<"GET:/registrations", null, Registrations[]> = {
    authentication: true,
    method: "GET",
    path: "/registrations",
    hasUrlParams: false,
    func: async ctx => null as any
};

const getTotal: EndpointRoute<"GET:/registrations/total", null, { total: number }> = {
    authentication: true,
    method: "GET",
    path: "/registrations/total",
    hasUrlParams: false,
    func: async ctx => null as any
};

const postReq = omit(v_Registrations, ["id", "payment_amount", "payment_date"]);
const post: DefaultEndpointRoute<"POST:/registrations", typeof postReq> = {
    authentication: false,
    method: "POST",
    path: "/registrations",
    hasUrlParams: false,
    validation: () => postReq,
    func: async ctx => null as any
};

const update: DefaultEndpointRoute<"PUT:/registrations", typeof v_Registrations> = {
    authentication: true,
    method: "PUT",
    path: "/registrations",
    hasUrlParams: false,
    validation: () => v_Registrations,
    func: async ctx => null as any
};

const del: DefaultEndpointRoute<"DELETE:/registrations", number[]> = {
    authentication: true,
    method: "DELETE",
    path: "/registrations",
    hasUrlParams: false,
    func: async ctx => null as any
};

const v_Email = object({ email: string() });
const emailSubscribe: DefaultEndpointRoute<"POST:/registrations/email-subscribe", typeof v_Email> = {
    authentication: false,
    method: "POST",
    path: "/registrations/email-subscribe",
    hasUrlParams: false,
    validation: () => v_Email,
    func: async ctx => null as any
};

const v_EmailToken = object({ token: string() });
const emailUnsubscribe: DefaultEndpointRoute<"POST:/registrations/email-unsubscribe", typeof v_EmailToken> = {
    authentication: false,
    method: "POST",
    path: "/registrations/email-unsubscribe",
    hasUrlParams: false,
    validation: () => v_EmailToken,
    func: async ctx => null as any
};

const getSubscriptionToken: EndpointRoute<"POST:/registrations/email-subscribe/token", typeof v_Email, { token: string }> = {
    authentication: false,
    method: "POST",
    path: "/registrations/email-subscribe/token",
    hasUrlParams: false,
    validation: () => v_Email,
    func: async ctx => null as any
};

export const RegistrationsRoutes = {
    get,
    getTotal,
    post,
    update,
    delete: del,
    emailSubscribe,
    emailUnsubscribe,
    getSubscriptionToken
};

export type APIRegistrationsArgs = APIArguments<"Registrations", typeof RegistrationsRoutes>;

export type APIRegistrationsResponse = APIResponse<"Registrations", typeof RegistrationsRoutes>;

export const APIRegistrationsEndpoints: APIEndpointsBuilder<"Registrations", typeof RegistrationsRoutes> = {
    "Registrations.get": {
        method: "GET",
        path: "/registrations",
        endpoint: "Registrations.get"
    },
    "Registrations.getTotal": {
        method: "GET",
        path: "/registrations/total",
        endpoint: "Registrations.getTotal"
    },
    "Registrations.post": {
        method: "POST",
        path: "/registrations",
        endpoint: "Registrations.post",
        validation: postReq
    },
    "Registrations.update": {
        method: "PUT",
        path: "/registrations",
        endpoint: "Registrations.update",
        validation: v_Registrations
    },
    "Registrations.delete": {
        method: "DELETE",
        path: "/registrations",
        endpoint: "Registrations.delete"
    },
    "Registrations.emailSubscribe": {
        method: "POST",
        path: "/registrations/email-subscribe",
        endpoint: "Registrations.emailSubscribe",
        validation: v_Email
    },
    "Registrations.emailUnsubscribe": {
        method: "POST",
        path: "/registrations/email-unsubscribe",
        endpoint: "Registrations.emailUnsubscribe",
        validation: v_EmailToken
    },
    "Registrations.getSubscriptionToken": {
        method: "POST",
        path: "/registrations/email-subscribe/token",
        endpoint: "Registrations.getSubscriptionToken",
        validation: v_Email
    },
};

export const APIRegistrations: APIBuilder<"Registrations", typeof RegistrationsRoutes> = {
    Registrations: {
        get: "Registrations.get",
        getTotal: "Registrations.getTotal",
        post: "Registrations.post",
        update: "Registrations.update",
        delete: "Registrations.delete",
        emailSubscribe: "Registrations.emailSubscribe",
        emailUnsubscribe: "Registrations.emailUnsubscribe",
        getSubscriptionToken: "Registrations.getSubscriptionToken"
    }
};
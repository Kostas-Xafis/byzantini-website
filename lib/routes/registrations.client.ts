import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Registrations, type Registrations } from "../../types/entities";
import { omit } from "valibot";

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

const complete: DefaultEndpointRoute<"DELETE:/registrations", number[]> = {
    authentication: true,
    method: "DELETE",
    path: "/registrations",
    hasUrlParams: false,
    func: async ctx => null as any
};

export const RegistrationsRoutes = {
    get,
    getTotal,
    post,
    update,
    complete,
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
    "Registrations.complete": {
        method: "DELETE",
        path: "/registrations",
        endpoint: "Registrations.complete"
    },
};

export const APIRegistrations: APIBuilder<"Registrations", typeof RegistrationsRoutes> = {
    Registrations: {
        get: "Registrations.get",
        getTotal: "Registrations.getTotal",
        post: "Registrations.post",
        update: "Registrations.update",
        complete: "Registrations.complete",
    }
};
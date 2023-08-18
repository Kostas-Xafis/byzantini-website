import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Registrations, type Registrations } from "../../types/entities";
import { omit } from "valibot";

const get: EndpointRoute<"GET:/registrations", null, Registrations[]> = {
    authentication: true,
    method: "GET",
    path: "/registrations",
    hasUrlParams: false,
    func: async req => null as any
};


const postReq = omit(v_Registrations, ["id", "payment_amount", "payment_date"]);
const post: DefaultEndpointRoute<"POST:/registrations", typeof postReq> = {
    authentication: false,
    method: "POST",
    path: "/registrations",
    hasUrlParams: false,
    validation: () => postReq,
    func: async req => null as any
};

const updateReq = omit(v_Registrations, ["class_id", "teacher_id", "instrument_id"]);
const update: DefaultEndpointRoute<"PUT:/registrations", typeof updateReq> = {
    authentication: true,
    method: "PUT",
    path: "/registrations",
    hasUrlParams: false,
    validation: () => updateReq,
    func: async req => null as any
};

const complete: DefaultEndpointRoute<"DELETE:/registrations", number[]> = {
    authentication: true,
    method: "DELETE",
    path: "/registrations",
    hasUrlParams: false,
    func: async req => null as any
};

export const RegistrationsRoutes = {
    get,
    post,
    update,
    complete
};

export type APIRegistrationsArgs = APIArguments<"Registrations", typeof RegistrationsRoutes>;

export type APIRegistrationsResponse = APIResponse<"Registrations", typeof RegistrationsRoutes>;

export const APIRegistrationsEndpoints: APIEndpointsBuilder<"Registrations", typeof RegistrationsRoutes> = {
    "Registrations.get": {
        method: "GET",
        path: "/registrations",
        endpoint: "Registrations.get"
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
        validation: updateReq
    },
    "Registrations.complete": {
        method: "DELETE",
        path: "/registrations",
        endpoint: "Registrations.complete"
    }
};

export const APIRegistrations: APIBuilder<"Registrations", typeof RegistrationsRoutes> = {
    Registrations: {
        get: "Registrations.get",
        post: "Registrations.post",
        update: "Registrations.update",
        complete: "Registrations.complete"
    }
};
import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { z_Registrations, type Registrations } from "../../types/entities";
import { z } from "zod";

const get: EndpointRoute<"GET:/registrations", null, Registrations[]> = {
    authentication: true,
    method: "GET",
    path: "/registrations",
    hasUrlParams: false,
    func: async req => null as any
};

let postReq = z_Registrations.omit({ id: true }).merge(z.object({ instruments: z.array(z.number().int().nonnegative()) }));
const post: DefaultEndpointRoute<"POST:/registrations", typeof postReq> = {
    authentication: false,
    method: "POST",
    path: "/registrations",
    hasUrlParams: false,
    validation: () => postReq,
    func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/registrations", number[]> = {
    authentication: true,
    method: "DELETE",
    path: "/registrations",
    hasUrlParams: false,
    func: async req => null as any
};

export const RegistrationsRoutes = {
    get,
    post,
    delete: del
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
    "Registrations.delete": {
        method: "DELETE",
        path: "/registrations",
        endpoint: "Registrations.delete"
    }
};

export const APIRegistrations: APIBuilder<"Registrations", typeof RegistrationsRoutes> = {
    Registrations: {
        get: "Registrations.get",
        post: "Registrations.post",
        delete: "Registrations.delete"
    }
};
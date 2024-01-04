import { omit } from "valibot";
import { v_Wholesalers, type Wholesalers } from "../../types/entities";
import type { APIArguments, APIResponse, EndpointRoute } from "../../types/routes";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

const get: EndpointRoute<"/wholesalers", null, Wholesalers[]> = {
	authentication: true,
	method: "GET",
	path: "/wholesalers",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/wholesalers/id", number[], Wholesalers> = {
	authentication: true,
	method: "POST",
	path: "/wholesalers/id",
	hasUrlParams: false,
};

const postReq = omit(v_Wholesalers, ["id"]);
const post: EndpointRoute<"/wholesalers", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/wholesalers",
	hasUrlParams: false,
	validation: () => postReq,
};
const remove: EndpointRoute<"/wholesalers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/wholesalers",
	hasUrlParams: false,
};

export const WholesalersRoutes = { get, post, getById, delete: remove };

export type APIWholesalersArgs = APIArguments<"Wholesalers", typeof WholesalersRoutes>;

export type APIWholesalersResponse = APIResponse<"Wholesalers", typeof WholesalersRoutes>;

export const APIWholesalersEndpoints = EndpointsConstructor("Wholesalers", WholesalersRoutes);

export const APIWholesalers = APIBuilderConstructor("Wholesalers", WholesalersRoutes);

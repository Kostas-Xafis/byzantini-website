import { v_Wholesalers, type Insert, type Wholesalers } from "@_types/entities";
import type { EndpointRoute } from "@_types/routes";
import { omit } from "valibot";

const get: EndpointRoute<"/wholesalers", any, Wholesalers[]> = {
	authentication: true,
	method: "GET",
	path: "/wholesalers",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/wholesalers/id", number[], Wholesalers> = {
	authentication: true,
	method: "POST",
	path: "/wholesalers/id",
	hasUrlParams: false,
	validation: undefined,
};

const postReq = omit(v_Wholesalers, ["id"]);
const post: EndpointRoute<"/wholesalers", typeof postReq, Insert> = {
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
	validation: undefined,
};

export const WholesalersRoutes = { get, post, getById, delete: remove };

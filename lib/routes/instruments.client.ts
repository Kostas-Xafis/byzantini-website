import { v_Instruments, type Insert, type Instruments } from "@_types/entities";
import type { EndpointRoute } from "@_types/routes";
import { omit } from "valibot";

const get: EndpointRoute<"/instruments", any, Instruments[]> = {
	authentication: false,
	method: "GET",
	path: "/instruments",
	hasUrlParams: false,
	validation: undefined,
};

let postReq = omit(v_Instruments, ["id"]);
const post: EndpointRoute<"/instruments", typeof postReq, Insert> = {
	authentication: true,
	method: "POST",
	path: "/instruments",
	hasUrlParams: false,
	validation: () => postReq,
};

const getById: EndpointRoute<"/instruments/id", number[], Instruments> = {
	authentication: false,
	method: "POST",
	path: "/instruments/id",
	hasUrlParams: false,
	validation: undefined,
};

const del: EndpointRoute<"/instruments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/instruments",
	hasUrlParams: false,
	validation: undefined,
};

export const InstrumentsRoutes = {
	get,
	post,
	getById,
	delete: del,
};

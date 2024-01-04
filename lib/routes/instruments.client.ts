import { omit } from "valibot";
import { v_Instruments, type Instruments } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/instruments", null, Instruments[]> = {
	authentication: false,
	method: "GET",
	path: "/instruments",
	hasUrlParams: false,
};

let postReq = omit(v_Instruments, ["id"]);
const post: EndpointRoute<"/instruments", typeof postReq, { insertId: number; }> = {
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
};

const del: EndpointRoute<"/instruments", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/instruments",
	hasUrlParams: false,
};

export const InstrumentsRoutes = {
	get,
	post,
	getById,
	delete: del,
};

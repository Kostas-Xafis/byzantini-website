import { omit } from "valibot";
import { v_Locations, type Locations } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/locations", any, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations",
	hasUrlParams: false,
	validation: undefined,
};

const getByPriority: EndpointRoute<"/locations/priority", any, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations/priority",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/locations/id", number[], Locations> = {
	authentication: true,
	method: "POST",
	path: "/locations/id",
	hasUrlParams: false,
	validation: undefined,
};

const postReq = omit(v_Locations, ["id", "image"]);
const post: EndpointRoute<"/locations", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/locations",
	hasUrlParams: false,
	validation: () => postReq,
};

const quantityReq = omit(v_Locations, ["image"]);
const update: EndpointRoute<"/locations", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/locations",
	hasUrlParams: false,
	validation: () => quantityReq,
};

const fileUpload: EndpointRoute<"/locations/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const fileDelete: EndpointRoute<"/locations/file/[id:number]", any> = {
	authentication: true,
	method: "DELETE",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const del: EndpointRoute<"/locations", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/locations",
	hasUrlParams: false,
	validation: undefined,
};

export const LocationsRoutes = {
	get,
	getById,
	getByPriority,
	post,
	update,
	fileUpload,
	fileDelete,
	delete: del,
};

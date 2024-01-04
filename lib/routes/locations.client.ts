import { omit } from "valibot";
import { v_Locations, type Locations } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/locations", null, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations",
	hasUrlParams: false,
};

const getByPriority: EndpointRoute<"/locations/priority", null, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations/priority",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/locations/id", number[], Locations> = {
	authentication: true,
	method: "POST",
	path: "/locations/id",
	hasUrlParams: false,
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
};

const fileDelete: EndpointRoute<"/locations/file/[id:number]", null> = {
	authentication: true,
	method: "DELETE",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
};

const del: EndpointRoute<"/locations", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/locations",
	hasUrlParams: false,
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

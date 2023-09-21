import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Locations, type Locations } from "../../types/entities";
import { omit } from "valibot";

const get: EndpointRoute<"GET:/locations", null, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getByPriority: EndpointRoute<"GET:/locations/priority", null, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations/priority",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"POST:/locations/id", number[], Locations> = {
	authentication: true,
	method: "POST",
	path: "/locations/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const postReq = omit(v_Locations, ["id", "image"]);
const post: EndpointRoute<"POST:/locations", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/locations",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

const quantityReq = omit(v_Locations, ["image"]);
const update: EndpointRoute<"PUT:/locations", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/locations",
	hasUrlParams: false,
	validation: () => quantityReq,
	func: async ctx => null as any
};

const fileUpload: EndpointRoute<"PUT:/locations/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
	func: async ctx => null as any
};

const fileDelete: EndpointRoute<"DELETE:/locations/file/[id:number]", null> = {
	authentication: true,
	method: "DELETE",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
	func: async ctx => null as any
};

const del: DefaultEndpointRoute<"DELETE:/locations", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/locations",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const LocationsRoutes = {
	get,
	getById,
	getByPriority,
	post,
	update,
	fileUpload,
	fileDelete,
	delete: del
};

export type APILocationsArgs = APIArguments<"Locations", typeof LocationsRoutes>;

export type APILocationsResponse = APIResponse<"Locations", typeof LocationsRoutes>;

export const APILocationsEndpoints: APIEndpointsBuilder<"Locations", typeof LocationsRoutes> = {
	"Locations.get": {
		method: "GET",
		path: "/locations",
		endpoint: "Locations.get"
	},
	"Locations.getById": {
		method: "POST",
		path: "/locations/id",
		endpoint: "Locations.getById"
	},
	"Locations.getByPriority": {
		method: "GET",
		path: "/locations/priority",
		endpoint: "Locations.getByPriority"
	},
	"Locations.post": {
		method: "POST",
		path: "/locations",
		endpoint: "Locations.post",
		validation: postReq
	},
	"Locations.update": {
		method: "PUT",
		path: "/locations",
		endpoint: "Locations.update",
		validation: quantityReq
	},
	"Locations.fileUpload": {
		method: "PUT",
		path: "/locations/file/[id:number]",
		endpoint: "Locations.fileUpload"
	},
	"Locations.fileDelete": {
		method: "DELETE",
		path: "/locations/file/[id:number]",
		endpoint: "Locations.fileDelete"
	},
	"Locations.delete": {
		method: "DELETE",
		path: "/locations",
		endpoint: "Locations.delete"
	}
};

export const APILocations: APIBuilder<"Locations", typeof LocationsRoutes> = {
	Locations: {
		get: "Locations.get",
		getById: "Locations.getById",
		getByPriority: "Locations.getByPriority",
		post: "Locations.post",
		update: "Locations.update",
		fileUpload: "Locations.fileUpload",
		fileDelete: "Locations.fileDelete",
		delete: "Locations.delete"
	}
};

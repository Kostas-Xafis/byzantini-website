import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { z_Locations, type Locations } from "../../types/entities";

const get: EndpointRoute<"GET:/locations", null, Locations[]> = {
	authentication: false,
	method: "GET",
	path: "/locations",
	hasUrlParams: false,
	func: async req => null as any
};

const postReq = z_Locations.omit({ id: true, image: true });
const post: EndpointRoute<"POST:/locations", typeof postReq, { insertId: number }> = {
	authentication: true,
	method: "POST",
	path: "/locations",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

const quantityReq = z_Locations.omit({ image: true });
const update: EndpointRoute<"PUT:/locations", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/locations",
	hasUrlParams: false,
	validation: () => quantityReq,
	func: async req => null as any
};

const fileUpload: EndpointRoute<"PUT:/locations/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/locations/file/[id:number]",
	hasUrlParams: true,
	func: async req => null as any
};

const fileDelete: EndpointRoute<"PUT:/locations/file", { id: number }> = {
	authentication: true,
	method: "PUT",
	path: "/locations/file",
	hasUrlParams: false,
	func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/locations", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/locations",
	hasUrlParams: false,
	func: async req => null as any
};

export const LocationsRoutes = {
	get,
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
		method: "PUT",
		path: "/locations/file",
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
		post: "Locations.post",
		update: "Locations.update",
		fileUpload: "Locations.fileUpload",
		fileDelete: "Locations.fileDelete",
		delete: "Locations.delete"
	}
};

import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Announcements, type Announcements, v_AnnouncementImages, type AnnouncementImages } from "../../types/entities";

const get: EndpointRoute<"GET:/announcements", null, Omit<Announcements, "content">[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"POST:/announcements/id", number[], Announcements & { images: string[]; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const post: EndpointRoute<"POST:/announcements", typeof v_Announcements, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => v_Announcements,
	func: async ctx => null as any
};

const del: DefaultEndpointRoute<"DELETE:/announcements", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const AnnouncementsRoutes = {
	get,
	getById,
	post,
	delete: del
};

export type APIAnnouncementsArgs = APIArguments<"Announcements", typeof AnnouncementsRoutes>;

export type APIAnnouncementsResponse = APIResponse<"Announcements", typeof AnnouncementsRoutes>;

export const APIAnnouncementsEndpoints: APIEndpointsBuilder<"Announcements", typeof AnnouncementsRoutes> = {
	"Announcements.get": {
		method: "GET",
		path: "/announcements",
		endpoint: "Announcements.get"
	},
	"Announcements.getById": {
		method: "POST",
		path: "/announcements/id",
		endpoint: "Announcements.getById"
	},
	"Announcements.post": {
		method: "POST",
		path: "/announcements",
		endpoint: "Announcements.post",
		validation: v_Announcements
	},
	"Announcements.delete": {
		method: "DELETE",
		path: "/announcements",
		endpoint: "Announcements.delete"
	}
};

export const APIAnnouncements: APIBuilder<"Announcements", typeof AnnouncementsRoutes> = {
	Announcements: {
		get: "Announcements.get",
		getById: "Announcements.getById",
		post: "Announcements.post",
		delete: "Announcements.delete"
	}
};

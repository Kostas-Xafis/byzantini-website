import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Announcements, type Announcements, v_AnnouncementImages } from "../../types/entities";
import { omit } from "valibot";

const get: EndpointRoute<"GET:/announcements", null, Announcements[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"POST:/announcements/id", number[], Announcements & { images: string[]; }> = {
	authentication: false,
	method: "POST",
	path: "/announcements/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const postReq = omit(v_Announcements, ["id", "views"]);
const post: EndpointRoute<"POST:/announcements", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

const postImage: EndpointRoute<"POST:/announcements/image", typeof v_AnnouncementImages, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements/image",
	hasUrlParams: false,
	validation: () => v_AnnouncementImages,
	func: async ctx => null as any
};

const imageUpload: EndpointRoute<"POST:/announcements/image/[id:number]", Blob> = {
	authentication: true,
	method: "POST",
	path: "/announcements/image/[id:number]",
	hasUrlParams: true,
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
	postImage,
	imageUpload,
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
		validation: postReq
	},
	"Announcements.postImage": {
		method: "POST",
		path: "/announcements/image",
		endpoint: "Announcements.postImage",
		validation: v_AnnouncementImages
	},
	"Announcements.imageUpload": {
		method: "POST",
		path: "/announcements/image/[id:number]",
		endpoint: "Announcements.imageUpload"
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
		postImage: "Announcements.postImage",
		imageUpload: "Announcements.imageUpload",
		delete: "Announcements.delete"
	}
};

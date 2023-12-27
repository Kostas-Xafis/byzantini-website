import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Announcements, type Announcements, v_AnnouncementImages } from "../../types/entities";
import { omit } from "valibot";

const get: EndpointRoute<"/announcements", null, Announcements[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getSimple: EndpointRoute<"/announcements/no-content", null, Omit<Announcements, "content">[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements/no-content",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"/announcements/id", number[], Announcements> = {
	authentication: false,
	method: "POST",
	path: "/announcements/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getByTitle: EndpointRoute<"/announcements/title/[title:string]", null, Announcements & { images: string[]; }> = {
	authentication: false,
	method: "POST",
	path: "/announcements/title/[title:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};


const postReq = omit(v_Announcements, ["id", "views"]);
const post: EndpointRoute<"/announcements", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

const postImage: EndpointRoute<"/announcements/image", typeof v_AnnouncementImages, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements/image",
	hasUrlParams: false,
	validation: () => v_AnnouncementImages,
	func: async ctx => null as any
};

const imageUpload: EndpointRoute<"/announcements/image/[id:number]/[name:string]", Blob> = {
	authentication: true,
	method: "POST",
	path: "/announcements/image/[id:number]/[name:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};

const del: EndpointRoute<"/announcements", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const AnnouncementsRoutes = {
	get,
	getSimple,
	getById,
	getByTitle,
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
	"Announcements.getSimple": {
		method: "GET",
		path: "/announcements/no-content",
		endpoint: "Announcements.getSimple"
	},
	"Announcements.getById": {
		method: "POST",
		path: "/announcements/id",
		endpoint: "Announcements.getById"
	},
	"Announcements.getByTitle": {
		method: "POST",
		path: "/announcements/title/[title:string]",
		endpoint: "Announcements.getByTitle"
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
		path: "/announcements/image/[id:number]/[name:string]",
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
		getSimple: "Announcements.getSimple",
		getById: "Announcements.getById",
		getByTitle: "Announcements.getByTitle",
		post: "Announcements.post",
		postImage: "Announcements.postImage",
		imageUpload: "Announcements.imageUpload",
		delete: "Announcements.delete"
	}
};

import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Announcements, type Announcements, v_AnnouncementImages, type AnnouncementImages } from "../../types/entities";
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

const updateReq = omit(v_Announcements, ["views"]);
const update: EndpointRoute<"/announcements", typeof updateReq> = {
	authentication: true,
	method: "PUT",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => updateReq,
	func: async ctx => null as any
};

const del: EndpointRoute<"/announcements", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getImages: EndpointRoute<"/announcements/images", null, AnnouncementImages[]> = {
	authentication: true,
	method: "GET",
	path: "/announcements/images",
	hasUrlParams: false,
	func: async ctx => null as any
};

// Put image data in database
const postImage: EndpointRoute<"/announcements/images", typeof v_AnnouncementImages, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images",
	hasUrlParams: false,
	validation: () => v_AnnouncementImages,
	func: async ctx => null as any
};
// Store image in bucket
const imageUpload: EndpointRoute<"/announcements/images/[id:number]/[name:string]", Blob> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images/[id:number]/[name:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};

// Delete images from bucket
const imagesDelete: EndpointRoute<"/announcements/images/[announcement_id:number]", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements/images/[announcement_id:number]",
	hasUrlParams: true,
	func: async ctx => null as any
};


export const AnnouncementsRoutes = {
	get,
	getImages,
	getSimple,
	getById,
	getByTitle,
	post,
	update,
	postImage,
	imageUpload,
	delete: del,
	imagesDelete,
};

export type APIAnnouncementsArgs = APIArguments<"Announcements", typeof AnnouncementsRoutes>;

export type APIAnnouncementsResponse = APIResponse<"Announcements", typeof AnnouncementsRoutes>;

export const APIAnnouncementsEndpoints: APIEndpointsBuilder<"Announcements", typeof AnnouncementsRoutes> = {
	"Announcements.get": {
		method: "GET",
		path: "/announcements",
		endpoint: "Announcements.get"
	},
	"Announcements.getImages": {
		method: "GET",
		path: "/announcements/images",
		endpoint: "Announcements.getImages"
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
	"Announcements.update": {
		method: "PUT",
		path: "/announcements",
		endpoint: "Announcements.update",
		validation: updateReq
	},
	"Announcements.postImage": {
		method: "POST",
		path: "/announcements/images",
		endpoint: "Announcements.postImage",
		validation: v_AnnouncementImages
	},
	"Announcements.imageUpload": {
		method: "POST",
		path: "/announcements/images/[id:number]/[name:string]",
		endpoint: "Announcements.imageUpload"
	},
	"Announcements.delete": {
		method: "DELETE",
		path: "/announcements",
		endpoint: "Announcements.delete"
	},
	"Announcements.imagesDelete": {
		method: "DELETE",
		path: "/announcements/images/[announcement_id:number]",
		endpoint: "Announcements.imagesDelete"
	}
};

export const APIAnnouncements: APIBuilder<"Announcements", typeof AnnouncementsRoutes> = {
	Announcements: {
		get: "Announcements.get",
		getImages: "Announcements.getImages",
		getSimple: "Announcements.getSimple",
		getById: "Announcements.getById",
		getByTitle: "Announcements.getByTitle",
		post: "Announcements.post",
		update: "Announcements.update",
		postImage: "Announcements.postImage",
		imageUpload: "Announcements.imageUpload",
		delete: "Announcements.delete",
		imagesDelete: "Announcements.imagesDelete"
	}
};

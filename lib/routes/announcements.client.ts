import { omit } from "valibot";
import {
	v_AnnouncementImages,
	v_Announcements,
	type AnnouncementImages,
	type Announcements,
} from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/announcements", any, Announcements[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
	validation: undefined,
};

const getSimple: EndpointRoute<"/announcements/no-content", any, Omit<Announcements, "content">[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements/no-content",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/announcements/id", number[], Announcements> = {
	authentication: false,
	method: "POST",
	path: "/announcements/id",
	hasUrlParams: false,
	validation: undefined,
};

const getImagesById: EndpointRoute<"/announcements/images/[id:number]", any, AnnouncementImages[]> = {
	authentication: true,
	method: "GET",
	path: "/announcements/images/[id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const getByTitle: EndpointRoute<"/announcements/title/[title:string]", any, Announcements & { images: string[]; }> = {
	authentication: false,
	method: "POST",
	path: "/announcements/title/[title:string]",
	hasUrlParams: true,
	validation: undefined,
};

const postReq = omit(v_Announcements, ["id", "views", "image_counter"]);
const post: EndpointRoute<"/announcements", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => postReq,
};

const updateReq = omit(v_Announcements, ["views", "image_counter"]);
const update: EndpointRoute<"/announcements", typeof updateReq> = {
	authentication: true,
	method: "PUT",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => updateReq,
};

const del: EndpointRoute<"/announcements", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements",
	hasUrlParams: false,
	validation: undefined,
};

const getImages: EndpointRoute<"/announcements/images", any, AnnouncementImages[]> = {
	authentication: true,
	method: "GET",
	path: "/announcements/images",
	hasUrlParams: false,
	validation: undefined,
};

const postImageReq = omit(v_AnnouncementImages, ["id"]);
// Put image data in database
const postImage: EndpointRoute<
	"/announcements/images",
	typeof postImageReq,
	{ insertId: number; }
> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images",
	hasUrlParams: false,
	validation: () => postImageReq,
};

// Store image in bucket
const imageUpload: EndpointRoute<"/announcements/images/[id:number]/[name:string]", Blob> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images/[id:number]/[name:string]",
	hasUrlParams: true,
	validation: undefined,
};

// Delete images from bucket
const imagesDelete: EndpointRoute<"/announcements/images/[announcement_id:number]", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements/images/[announcement_id:number]",
	hasUrlParams: true,
	validation: undefined,
};

export const AnnouncementsRoutes = {
	get,
	getImages,
	getSimple,
	getById,
	getImagesById,
	getByTitle,
	post,
	update,
	postImage,
	imageUpload,
	delete: del,
	imagesDelete,
};

import type { EndpointRoute, APIArguments, APIResponse } from "../../types/routes";
import {
	v_Announcements,
	type Announcements,
	v_AnnouncementImages,
	type AnnouncementImages,
} from "../../types/entities";
import { omit } from "valibot";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

const get: EndpointRoute<"/announcements", null, Announcements[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
};

const getSimple: EndpointRoute<"/announcements/no-content", null, Omit<Announcements, "content">[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements/no-content",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/announcements/id", number[], Announcements> = {
	authentication: false,
	method: "POST",
	path: "/announcements/id",
	hasUrlParams: false,
};

const getByTitle: EndpointRoute<"/announcements/title/[title:string]", null, Announcements & { images: string[]; }> = {
	authentication: false,
	method: "POST",
	path: "/announcements/title/[title:string]",
	hasUrlParams: true,
};

const postReq = omit(v_Announcements, ["id", "views"]);
const post: EndpointRoute<"/announcements", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/announcements",
	hasUrlParams: false,
	validation: () => postReq,
};

const updateReq = omit(v_Announcements, ["views"]);
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
};

const getImages: EndpointRoute<"/announcements/images", null, AnnouncementImages[]> = {
	authentication: true,
	method: "GET",
	path: "/announcements/images",
	hasUrlParams: false,
};

// Put image data in database
const postImage: EndpointRoute<
	"/announcements/images",
	typeof v_AnnouncementImages,
	{ insertId: number; }
> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images",
	hasUrlParams: false,
	validation: () => v_AnnouncementImages,
};

// Store image in bucket
const imageUpload: EndpointRoute<"/announcements/images/[id:number]/[name:string]", Blob> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images/[id:number]/[name:string]",
	hasUrlParams: true,
};

// Delete images from bucket
const imagesDelete: EndpointRoute<"/announcements/images/[announcement_id:number]", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements/images/[announcement_id:number]",
	hasUrlParams: true,
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

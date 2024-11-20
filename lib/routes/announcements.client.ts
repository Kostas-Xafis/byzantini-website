import { blob, merge, number, object, omit, optional, string } from "valibot";
import {
	v_AnnouncementImages,
	v_Announcements,
	type AnnouncementImages,
	type Announcements,
	type Insert,
} from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/announcements", any, Announcements[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements",
	hasUrlParams: false,
	validation: undefined,
};
// I will need to paginate it. That will come later though.
export type PageAnnouncement = Announcements & { main_image: string, total_images: number; };
const getForPage: EndpointRoute<"/announcements/page", any, PageAnnouncement[]> = {
	authentication: false,
	method: "GET",
	path: "/announcements/page",
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

const getByTitle: EndpointRoute<"/announcements/title/[title:string]", any, Announcements & { images: AnnouncementImages[]; }> = {
	authentication: false,
	method: "POST",
	path: "/announcements/title/[title:string]",
	hasUrlParams: true,
	validation: undefined,
};

const postReq = merge([omit(v_Announcements, ["id", "views"]), object({ links: string() })]);
const post: EndpointRoute<"/announcements", typeof postReq, Insert> = {
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
	validation: undefined,
};

const getImages: EndpointRoute<"/announcements/images", any, AnnouncementImages[]> = {
	authentication: true,
	method: "GET",
	path: "/announcements/images",
	hasUrlParams: false,
	validation: undefined,
};

const postImageReq = merge([v_AnnouncementImages, object({ id: optional(number("Invalid number type")), fileData: blob(), thumbData: optional(blob()), fileType: string() })]);
// Put image data in database
const postImage: EndpointRoute<
	"/announcements/images",
	typeof postImageReq,
	Insert
> = {
	authentication: true,
	method: "POST",
	path: "/announcements/images",
	hasUrlParams: false,
	multipart: true,
	validation: () => postImageReq,
};

// Delete images from bucket
const imagesDelete: EndpointRoute<"/announcements/images/id/[announcement_id:number]", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements/images/id/[announcement_id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const imagesDeleteByName: EndpointRoute<"/announcements/images/name/[announcement_id:number]", string[]> = {
	authentication: true,
	method: "DELETE",
	path: "/announcements/images/name/[announcement_id:number]",
	hasUrlParams: true,
	validation: undefined,
};

export const AnnouncementsRoutes = {
	get,
	getImages,
	getForPage,
	getById,
	getImagesById,
	getByTitle,
	post,
	update,
	postImage,
	delete: del,
	imagesDelete,
	imagesDeleteByName
};

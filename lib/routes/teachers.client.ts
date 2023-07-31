import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { type Teachers, z_SimpleTeacher } from "../../types/entities";

const get: EndpointRoute<"GET:/teachers", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers",
	hasUrlParams: false,
	func: async req => null as any
};

let postReq = z_SimpleTeacher.omit({ id: true });
const post: EndpointRoute<"POST:/teachers", typeof postReq, { insertId: number }> = {
	authentication: true,
	method: "POST",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

const update: EndpointRoute<"PUT:/teachers", typeof z_SimpleTeacher> = {
	authentication: true,
	method: "PUT",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => z_SimpleTeacher,
	func: async req => null as any
};

const fileUpload: EndpointRoute<"PUT:/teachers/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file/[id:number]",
	hasUrlParams: true,
	func: async req => null as any
};

const fileDelete: EndpointRoute<"PUT:/teachers/file", { id: number; type: "cv" | "picture" }> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file",
	hasUrlParams: false,
	func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/teachers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/teachers",
	hasUrlParams: false,
	func: async req => null as any
};

export const TeachersRoutes = {
	get,
	post,
	update,
	fileUpload,
	fileDelete,
	delete: del
};

export type APITeachersArgs = APIArguments<"Teachers", typeof TeachersRoutes>;

export type APITeachersResponse = APIResponse<"Teachers", typeof TeachersRoutes>;

export const APITeachersEndpoints: APIEndpointsBuilder<"Teachers", typeof TeachersRoutes> = {
	"Teachers.get": {
		method: "GET",
		path: "/teachers",
		endpoint: "Teachers.get"
	},
	"Teachers.post": {
		method: "POST",
		path: "/teachers",
		endpoint: "Teachers.post",
		validation: postReq
	},
	"Teachers.update": {
		method: "PUT",
		path: "/teachers",
		endpoint: "Teachers.update",
		validation: z_SimpleTeacher
	},
	"Teachers.fileUpload": {
		method: "PUT",
		path: "/teachers/file/[id:number]",
		endpoint: "Teachers.fileUpload"
	},
	"Teachers.fileDelete": {
		method: "PUT",
		path: "/teachers/file",
		endpoint: "Teachers.fileDelete"
	},
	"Teachers.delete": {
		method: "DELETE",
		path: "/teachers",
		endpoint: "Teachers.delete"
	}
};

export const APITeachers: APIBuilder<"Teachers", typeof TeachersRoutes> = {
	Teachers: {
		get: "Teachers.get",
		post: "Teachers.post",
		update: "Teachers.update",
		fileUpload: "Teachers.fileUpload",
		fileDelete: "Teachers.fileDelete",
		delete: "Teachers.delete"
	}
};

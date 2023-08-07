import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { type Teachers, z_SimpleTeacher, TeacherClasses, TeacherLocations } from "../../types/entities";
import { z } from "zod";

const get: EndpointRoute<"GET:/teachers", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers",
	hasUrlParams: false,
	func: async req => null as any
};

const getByPriority: EndpointRoute<"GET:/teachers/priority", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/priority",
	hasUrlParams: false,
	func: async req => null as any
};

const getClasses: EndpointRoute<"GET:/teachers/teacherClasses", null, TeacherClasses[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/teacherClasses",
	hasUrlParams: false,
	func: async req => null as any
}

const getLocations: EndpointRoute<"GET:/teachers/locations", null, TeacherLocations[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/locations",
	hasUrlParams: false,
	func: async req => null as any
}

let postReq = z_SimpleTeacher.omit({ id: true }).merge(z.object({ teacherClasses: z.array(z.number()) }));
const post: EndpointRoute<"POST:/teachers", typeof postReq, { insertId: number }> = {
	authentication: true,
	method: "POST",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

let updateReq = z_SimpleTeacher.merge(z.object({ teacherClasses: z.array(z.number()) }));
const update: EndpointRoute<"PUT:/teachers", typeof updateReq> = {
	authentication: true,
	method: "PUT",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => updateReq,
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
	getByPriority,
	getClasses,
	getLocations,
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
	"Teachers.getByPriority": {
		method: "GET",
		path: "/teachers/priority",
		endpoint: "Teachers.getByPriority"
	},
	"Teachers.getClasses": {
		method: "GET",
		path: "/teachers/teacherClasses",
		endpoint: "Teachers.getClasses"
	},
	"Teachers.getLocations": {
		method: "GET",
		path: "/teachers/locations",
		endpoint: "Teachers.getLocations"
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
		validation: updateReq
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
		getByPriority: "Teachers.getByPriority",
		getClasses: "Teachers.getClasses",
		getLocations: "Teachers.getLocations",
		post: "Teachers.post",
		update: "Teachers.update",
		fileUpload: "Teachers.fileUpload",
		fileDelete: "Teachers.fileDelete",
		delete: "Teachers.delete"
	}
};

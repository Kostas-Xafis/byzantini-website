import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import type { Teachers, TeacherClasses, TeacherLocations, TeacherInstruments } from "../../types/entities";
import { v_SimpleTeacher } from "../../types/entities";
import { merge, array, number, integer, object, omit, string } from "valibot";


const get: EndpointRoute<"GET:/teachers", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"POST:/teachers/id", number[], Teachers> = {
	authentication: true,
	method: "POST",
	path: "/teachers/id",
	hasUrlParams: false,
	func: async ctx => null as any
};
const getByPriorityClasses: EndpointRoute<"GET:/teachers/priority/[class_type:string]", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/priority/[class_type:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};

const getByFullnames: EndpointRoute<"GET:/teachers/fullnames", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/fullnames",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getClasses: EndpointRoute<"GET:/teachers/teacherClasses", null, TeacherClasses[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/teacherClasses",
	hasUrlParams: false,
	func: async ctx => null as any
};
const getClassesById: EndpointRoute<"POST:/teachers/teacherClassesById", number[], TeacherClasses[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/teacherClassesById",
	hasUrlParams: false,
	func: async ctx => null as any
};
const getLocations: EndpointRoute<"GET:/teachers/locations", null, TeacherLocations[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/locations",
	hasUrlParams: false,
	func: async ctx => null as any
};
const getLocationsById: EndpointRoute<"POST:/teachers/locationsById", number[], TeacherLocations[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/locationsById",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getInstruments: EndpointRoute<"GET:/teachers/instruments", null, TeacherInstruments[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/instruments",
	hasUrlParams: false,
	func: async ctx => null as any
};
const getInstrumentsById: EndpointRoute<"POST:/teachers/instrumentsById", number[], TeacherInstruments[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/instrumentsById",
	hasUrlParams: false,
	func: async ctx => null as any
};

const teacherJoins = object({
	teacherClasses: array(number([integer()])),
	teacherLocations: array(number([integer()])),
	teacherInstruments: array(number([integer()])),
	priorities: array(number([integer()])),
	registrations_number: array(string())
});

const JoinedTeacher = merge([v_SimpleTeacher, teacherJoins]);
let postReq = omit(JoinedTeacher, ["id"]);
const post: EndpointRoute<"POST:/teachers", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

let updateReq = JoinedTeacher;
const update: EndpointRoute<"PUT:/teachers", typeof updateReq> = {
	authentication: true,
	method: "PUT",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => updateReq,
	func: async ctx => null as any
};

const fileUpload: EndpointRoute<"PUT:/teachers/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file/[id:number]",
	hasUrlParams: true,
	func: async ctx => null as any
};

const fileDelete: EndpointRoute<"PUT:/teachers/file", { id: number; type: "cv" | "picture"; }> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file",
	hasUrlParams: false,
	func: async ctx => null as any
};

const del: EndpointRoute<"DELETE:/teachers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/teachers",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const TeachersRoutes = {
	get,
	getById,
	getByPriorityClasses,
	getByFullnames,
	getClasses,
	getClassesById,
	getLocations,
	getLocationsById,
	getInstruments,
	getInstrumentsById,
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
	"Teachers.getById": {
		method: "POST",
		path: "/teachers/id",
		endpoint: "Teachers.getById"
	},
	"Teachers.getByPriorityClasses": {
		method: "GET",
		path: "/teachers/priority/[class_type:string]",
		endpoint: "Teachers.getByPriorityClasses"
	},
	"Teachers.getByFullnames": {
		method: "GET",
		path: "/teachers/fullnames",
		endpoint: "Teachers.getByFullnames"
	},
	"Teachers.getClasses": {
		method: "GET",
		path: "/teachers/teacherClasses",
		endpoint: "Teachers.getClasses"
	},
	"Teachers.getClassesById": {
		method: "POST",
		path: "/teachers/teacherClassesById",
		endpoint: "Teachers.getClassesById"
	},
	"Teachers.getLocations": {
		method: "GET",
		path: "/teachers/locations",
		endpoint: "Teachers.getLocations"
	},
	"Teachers.getLocationsById": {
		method: "POST",
		path: "/teachers/locationsById",
		endpoint: "Teachers.getLocationsById"
	},
	"Teachers.getInstruments": {
		method: "GET",
		path: "/teachers/instruments",
		endpoint: "Teachers.getInstruments",
	},
	"Teachers.getInstrumentsById": {
		method: "POST",
		path: "/teachers/instrumentsById",
		endpoint: "Teachers.getInstrumentsById"
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
		getById: "Teachers.getById",
		getByPriorityClasses: "Teachers.getByPriorityClasses",
		getByFullnames: "Teachers.getByFullnames",
		getClasses: "Teachers.getClasses",
		getClassesById: "Teachers.getClassesById",
		getLocations: "Teachers.getLocations",
		getLocationsById: "Teachers.getLocationsById",
		getInstruments: "Teachers.getInstruments",
		getInstrumentsById: "Teachers.getInstrumentsById",
		post: "Teachers.post",
		update: "Teachers.update",
		fileUpload: "Teachers.fileUpload",
		fileDelete: "Teachers.fileDelete",
		delete: "Teachers.delete"
	}
};

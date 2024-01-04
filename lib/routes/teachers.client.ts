import { array, integer, merge, number, object, omit, string } from "valibot";
import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "../../types/entities";
import { v_SimpleTeacher } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";


const get: EndpointRoute<"/teachers", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/teachers/id", number[], Teachers> = {
	authentication: true,
	method: "POST",
	path: "/teachers/id",
	hasUrlParams: false,
};
const getByPriorityClasses: EndpointRoute<"/teachers/priority/[class_type:string]", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/priority/[class_type:string]",
	hasUrlParams: true,
};

const getByFullnames: EndpointRoute<"/teachers/fullnames", null, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/fullnames",
	hasUrlParams: false,
};

const getClasses: EndpointRoute<"/teachers/teacherClasses", null, TeacherClasses[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/teacherClasses",
	hasUrlParams: false,
};
const getClassesById: EndpointRoute<"/teachers/teacherClassesById", number[], TeacherClasses[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/teacherClassesById",
	hasUrlParams: false,
};
const getLocations: EndpointRoute<"/teachers/locations", null, TeacherLocations[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/locations",
	hasUrlParams: false,
};
const getLocationsById: EndpointRoute<"/teachers/locationsById", number[], TeacherLocations[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/locationsById",
	hasUrlParams: false,
};

const getInstruments: EndpointRoute<"/teachers/instruments", null, TeacherInstruments[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/instruments",
	hasUrlParams: false,
};
const getInstrumentsById: EndpointRoute<"/teachers/instrumentsById", number[], TeacherInstruments[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/instrumentsById",
	hasUrlParams: false,
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
const post: EndpointRoute<"/teachers", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => postReq,
};

let updateReq = JoinedTeacher;
const update: EndpointRoute<"/teachers", typeof updateReq> = {
	authentication: true,
	method: "PUT",
	path: "/teachers",
	hasUrlParams: false,
	validation: () => updateReq,
};

const fileUpload: EndpointRoute<"/teachers/file/[id:number]", Blob> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file/[id:number]",
	hasUrlParams: true,
};

const fileDelete: EndpointRoute<"/teachers/file", { id: number; type: "cv" | "picture"; }> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file",
	hasUrlParams: false,
};

const del: EndpointRoute<"/teachers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/teachers",
	hasUrlParams: false,
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

import { array, integer, merge, number, object, omit, string } from "valibot";
import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "../../types/entities";
import { v_SimpleTeacher } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";


const get: EndpointRoute<"/teachers", any, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/teachers/id", number[], Teachers> = {
	authentication: true,
	method: "POST",
	path: "/teachers/id",
	hasUrlParams: false,
	validation: undefined,
};
const getByPriorityClasses: EndpointRoute<"/teachers/priority/[class_type:string]", any, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/priority/[class_type:string]",
	hasUrlParams: true,
	validation: undefined,
};

const getByFullnames: EndpointRoute<"/teachers/fullnames", any, Teachers[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/fullnames",
	hasUrlParams: false,
	validation: undefined,
};

const getClasses: EndpointRoute<"/teachers/teacherClasses", any, TeacherClasses[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/teacherClasses",
	hasUrlParams: false,
	validation: undefined,
};
const getClassesById: EndpointRoute<"/teachers/teacherClassesById", number[], TeacherClasses[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/teacherClassesById",
	hasUrlParams: false,
	validation: undefined,
};
const getLocations: EndpointRoute<"/teachers/locations", any, TeacherLocations[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/locations",
	hasUrlParams: false,
	validation: undefined,
};
const getLocationsById: EndpointRoute<"/teachers/locationsById", number[], TeacherLocations[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/locationsById",
	hasUrlParams: false,
	validation: undefined,
};

const getInstruments: EndpointRoute<"/teachers/instruments", any, TeacherInstruments[]> = {
	authentication: false,
	method: "GET",
	path: "/teachers/instruments",
	hasUrlParams: false,
	validation: undefined,
};
const getInstrumentsById: EndpointRoute<"/teachers/instrumentsById", number[], TeacherInstruments[]> = {
	authentication: true,
	method: "POST",
	path: "/teachers/instrumentsById",
	hasUrlParams: false,
	validation: undefined,
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
	validation: undefined,
};

// Renames the cv and the picture files in the bucket when the teacher is renamed
const fileRename: EndpointRoute<"/teachers/file/rename/[id:number]"> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file/rename/[id:number]",
	hasUrlParams: true,
	validation: undefined,
};

const fileDelete: EndpointRoute<"/teachers/file", { id: number; type: "cv" | "picture"; }> = {
	authentication: true,
	method: "PUT",
	path: "/teachers/file",
	hasUrlParams: false,
	validation: undefined,
};

const del: EndpointRoute<"/teachers", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/teachers",
	hasUrlParams: false,
	validation: undefined,
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
	fileRename,
	fileDelete,
	delete: del
};


//* I / O Read time: 0.21s
//* Parse time: 1.39s
//* ResolveModule time: 0.50s
//* ResolveTypeReference time: 0.02s
//* ResolveLibrary time: 0.03s
//* Program time: 2.35s
//* Bind time: 0.68s
//* Check time: 3.34s
//* printTime time: 0.00s
//* Emit time: 0.00s
//* Total time: 6.38s;



//* I / O Read time: 0.22s
//* Parse time: 1.40s
//* ResolveModule time: 0.50s
//* ResolveTypeReference time: 0.02s
//* ResolveLibrary time: 0.03s
//* Program time: 2.38s
//* Bind time: 0.71s
//* Check time: 3.76s
//* printTime time: 0.00s
//* Emit time: 0.00s
//* Total time: 6.85s;

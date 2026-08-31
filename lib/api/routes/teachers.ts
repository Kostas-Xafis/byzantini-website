import { z } from "astro/zod";
import type { APIContext } from "astro";
import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "@_types/entities";
import { Bucket } from "@lib/bucket";
import { ImageMIMEType, executeQuery } from "@lib/utils.server";
import { z_BlobUpload, z_TeacherClassesResponse, z_TeacherInstruments, z_TeacherLocations, z_Teachers } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Teachers — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/teachers.client|server.ts.
 *
 * NOTE: `Bucket` calls take an `APIContext` that is only used by the (unused)
 * `getS3Bucket` accessor; the Phase-4 handlers have no Astro context, so the
 * request is passed as a stand-in (dev path never touches it).
 */

const bucketPicturePrefix = "kathigites/picture/";
const bucketCVPrefix = "kathigites/cv/";

const positiveInt = (message = "Μη έγκυρος θετικός ακέραιος") => z.number().int().min(0, message);

// ---- Group-specific request schemas (kept inside this file) ----
const z_SimpleTeacher = z_Teachers.omit({ picture: true, cv: true });

const teacherJoins = z.object({
	teacherClasses: z.array(z.number().int()),
	teacherLocations: z.array(z.number().int()),
	teacherInstruments: z.array(z.number().int()),
	priorities: z.array(z.number().int()),
	registrations_number: z.array(z.string()),
});

const z_JoinedTeacher = z_SimpleTeacher.extend(teacherJoins.shape);
const postReq = z_JoinedTeacher.omit({ id: true });
const updateReq = z_JoinedTeacher;

const fileDeleteReq = z.object({
	id: positiveInt("Μη έγκυρο id"),
	type: z.union([z.literal("cv"), z.literal("picture")], { message: "Μη έγκυρος τύπος" }),
});

const z_IdArray = z.array(positiveInt());

export const teachersRoutes = {
	get: new APIServer({ method: "GET", path: "/teachers", responseSchema: z.array(z_Teachers) }, () =>
		handlerResult(() => executeQuery<Teachers>("SELECT * FROM teachers"), "Σφάλμα κατά την ανάκτηση των δασκάλων"),
	),
	getById: new APIServer({ method: "POST", path: "/teachers/id", schema: z_IdArray, responseSchema: z_Teachers }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id=?", body as number[]);
			if (!teacher) throw Error("Teacher not found");
			return teacher;
		}, "Δάσκαλος δεν βρέθηκε"),
	),
	getByPriorityClasses: new APIServer({ method: "GET", path: "/teachers/priority/[class_type:string]", responseSchema: z.array(z_Teachers) }, ({ params }) =>
		handlerResult(() => {
			const class_id = ["byz", "par", "eur"].findIndex((v) => v === params.class_type);
			if (class_id === -1) throw Error("Invalid class type");
			return executeQuery<Teachers>(
				"SELECT t.* FROM teachers as t JOIN teacher_classes as tc ON t.id = tc.teacher_id WHERE tc.class_id=? AND visible=1 ORDER BY tc.priority ASC",
				[class_id],
			);
		}, "Σφάλμα κατά την ανάκτηση των δασκάλων"),
	),
	getByFullnames: new APIServer({ method: "GET", path: "/teachers/fullnames", responseSchema: z.array(z_Teachers) }, () =>
		handlerResult(() => executeQuery<Teachers>("SELECT * FROM teachers ORDER BY fullname ASC"), "Σφάλμα κατά την ανάκτηση των δασκάλων"),
	),
	getClasses: new APIServer({ method: "GET", path: "/teachers/teacherClasses", responseSchema: z.array(z_TeacherClassesResponse) }, () =>
		handlerResult(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"), "Σφάλμα κατά την ανάκτηση των μαθημάτων των δασκάλων"),
	),
	getClassesById: new APIServer(
		{ method: "POST", path: "/teachers/teacherClassesById", schema: z_IdArray, responseSchema: z.array(z_TeacherClassesResponse) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(
				() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes WHERE teacher_id = ?", body as number[]),
				"Σφάλμα κατά την ανάκτηση των μαθημάτων του δασκάλου",
			),
	),
	getLocations: new APIServer({ method: "GET", path: "/teachers/locations", responseSchema: z.array(z_TeacherLocations) }, () =>
		handlerResult(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations")),
	),
	getLocationsById: new APIServer(
		{ method: "POST", path: "/teachers/locationsById", schema: z_IdArray, responseSchema: z.array(z_TeacherLocations) },
		[authenticateMiddleware],
		({ body }) => handlerResult(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations WHERE teacher_id = ?", body as number[])),
	),
	getInstruments: new APIServer({ method: "GET", path: "/teachers/instruments", responseSchema: z.array(z_TeacherInstruments) }, () =>
		handlerResult(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments")),
	),
	getInstrumentsById: new APIServer(
		{ method: "POST", path: "/teachers/instrumentsById", schema: z_IdArray, responseSchema: z.array(z_TeacherInstruments) },
		[authenticateMiddleware],
		({ body }) => handlerResult(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments WHERE teacher_id = ?", body as number[])),
	),
	post: new APIServer(
		{ method: "POST", path: "/teachers", schema: postReq, responseSchema: z.object({ insertId: z.number() }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const { insertId } = await T.executeQuery(
					`INSERT INTO teachers (fullname, amka, email, telephone, linktree, gender, title, visible, online) VALUES (???)`,
					body,
				);
				for (const class_id of body.teacherClasses) {
					const priority = body.priorities.shift();
					const registration_number = body.registrations_number.shift() || null;
					await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (???)`, [
						insertId,
						class_id,
						priority,
						registration_number,
					]);
				}
				for (const location_id of body.teacherLocations) {
					await T.executeQuery(`INSERT INTO teacher_locations (teacher_id, location_id) VALUES (?, ?)`, [insertId, location_id]);
				}
				for (const instrument_id of body.teacherInstruments) {
					await T.executeQuery(`INSERT INTO teacher_instruments (teacher_id, instrument_id) VALUES (?, ?)`, [insertId, instrument_id]);
				}
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη του δασκάλου"),
	),
	update: new APIServer({ method: "PUT", path: "/teachers", schema: updateReq }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			await T.executeQuery(
				`UPDATE teachers SET fullname=?, amka=?, email=?, telephone=?, linktree=?, gender=?, title=?, visible=?, online=? WHERE id=?`,
				body,
			);

			await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
			for (const class_id of body.teacherClasses) {
				const priority = body.priorities.shift();
				const registration_number = body.registrations_number.shift() || null;
				await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (???)`, [
					body.id,
					class_id,
					priority,
					registration_number,
				]);
			}

			await T.executeQuery("DELETE FROM teacher_locations WHERE teacher_id=?", [body.id]);
			for (const location_id of body.teacherLocations) {
				await T.executeQuery(`INSERT INTO teacher_locations (teacher_id, location_id) VALUES (?, ?)`, [body.id, location_id]);
			}

			await T.executeQuery("DELETE FROM teacher_instruments WHERE teacher_id=?", [body.id]);
			for (const instrument_id of body.teacherInstruments) {
				await T.executeQuery(`INSERT INTO teacher_instruments (teacher_id, instrument_id) VALUES (?, ?)`, [body.id, instrument_id]);
			}
			return "Teacher added successfully";
		}, "Σφάλμα κατά την ανανέωση του δασκάλου"),
	),
	fileUpload: new APIServer(
		{ method: "PUT", path: "/teachers/file/[id:number]", rawBlob: true, schema: z_BlobUpload },
		[authenticateMiddleware],
		({ params, body, request }) =>
			handlerResult(async () => {
				const id = Number(params.id);
				const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
				if (!teacher) throw Error("Teacher not found");

				const blob = body as Blob;
				const filetype = blob.type;
				const data = await blob.arrayBuffer();

				const filename = teacher.fullname + "." + filetype.split("/")[1];

				if (filetype === "application/pdf") {
					const link = bucketCVPrefix + filename;

					await Bucket.put(request as unknown as APIContext, data, link, filetype);
					await executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [filename, id]);
					return "Pdf uploaded successfully";
				} else if (ImageMIMEType.includes(filetype)) {
					const link = bucketPicturePrefix + filename;

					await Bucket.put(request as unknown as APIContext, data, link, filetype);
					await executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [filename, id]);
					return "Image uploaded successfully";
				}
				throw Error("Μη υποστηριζόμενος τύπος αρχείου");
			}, "Σφάλμα κατά την αποθήκευση του αρχείου"),
	),
	fileRename: new APIServer({ method: "PUT", path: "/teachers/file/rename/[id:number]" }, [authenticateMiddleware], ({ params, request }) =>
		handlerResult(async (T) => {
			const id = Number(params.id);
			const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
			if (!teacher) throw Error("Teacher not found");

			const oldNameCV = teacher.cv && teacher.cv.split(".")[0];
			const oldNameImg = teacher.picture && teacher.picture.split(".")[0];
			const newName = teacher.fullname;
			if (teacher.cv && oldNameCV !== newName) {
				const newFileName = newName + "." + teacher.cv.split(".").at(-1);
				await Bucket.move(request as unknown as APIContext, bucketCVPrefix + teacher.cv, bucketCVPrefix + newFileName);
				await T.executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [newFileName, id]);
			}
			if (teacher.picture && oldNameImg !== newName) {
				const imageFileType = teacher.picture.split(".").at(-1) as string;
				const newFileName = newName + "." + imageFileType;
				await Bucket.move(request as unknown as APIContext, bucketPicturePrefix + teacher.picture, bucketPicturePrefix + newFileName);
				await T.executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [newFileName, id]);
			}
			return "Files renamed successfully";
		}, "Σφάλμα κατά την μετονομασία των αρχείων"),
	),
	fileDelete: new APIServer({ method: "PUT", path: "/teachers/file", schema: fileDeleteReq }, [authenticateMiddleware], ({ body, request }) =>
		handlerResult(async (T) => {
			const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
			if (!teacher) throw Error("Teacher not found");
			if (body.type === "cv") {
				if (teacher.cv) await Bucket.delete(request as unknown as APIContext, bucketCVPrefix + teacher.cv);
				await T.executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
				return "Pdf deleted successfully" as string;
			} else if (body.type === "picture") {
				if (teacher.picture) await Bucket.delete(request as unknown as APIContext, bucketPicturePrefix + teacher.picture);
				await T.executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
				return "Image deleted successfully";
			}
			throw Error("Μη υποστηριζόμενος τύπος αρχείου");
		}, "Σφάλμα κατά την διαγραφή του αρχείου"),
	),
	delete: new APIServer({ method: "DELETE", path: "/teachers", schema: z_IdArray }, [authenticateMiddleware], ({ body, request }) =>
		handlerResult(async (T) => {
			const ids = body as number[];

			await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (???)`, ids);
			await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (???)`, ids);
			await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (???)`, ids);

			const files = await T.executeQuery<Teachers>(`SELECT cv, picture FROM teachers WHERE id IN (???)`, ids);
			for (const file of files) {
				if (file.cv) await Bucket.delete(request as unknown as APIContext, bucketCVPrefix + file.cv);
				if (file.picture) await Bucket.delete(request as unknown as APIContext, bucketPicturePrefix + file.picture);
			}
			await T.executeQuery(`DELETE FROM teachers WHERE id IN (???)`, ids);
			return "Teacher/s deleted successfully";
		}, "Σφάλμα κατά την διαγραφή του δασκάλου/δασκάλων"),
	),
};

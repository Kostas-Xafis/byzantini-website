import { z } from "astro/zod";
import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "@_types/entities";
import { Bucket } from "@lib/bucket";
import { extensionOfType, fileBaseName, safeBaseName, splitFileName, versionedFileName } from "@lib/bucket/fileNames";
import { isUploadImageType, MAX_UPLOAD_BYTES, THUMB_WIDTHS, thumbnailKey } from "@lib/bucket/publicFiles";
import { executeQuery } from "@lib/utils.server";
import { z_BlobUpload, z_IdArray, z_PublicTeacher, z_TeacherClassesResponse, z_TeacherInstruments, z_TeacherLocations, z_Teachers } from "@lib/api/schemas";
import { APIError } from "./APIError";
import { APIServer, handlerResult, HTTP } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Teachers — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/teachers.client|server.ts.
 */

const bucketPicturePrefix = "kathigites/picture/";
const bucketCVPrefix = "kathigites/cv/";

/**
 * Deletes the on-demand thumbnails (`kathigites/thumbs/w<N>/<name>`) of a picture that was deleted, replaced or
 * renamed. Best-effort: a missing or failing thumbnail delete never fails the request (a stale thumbnail is only
 * orphaned — its key embeds the old versioned name, which nothing links to any more).
 */
async function deletePictureThumbs(picture: string | null | undefined) {
	if (!picture) return;
	const keys = THUMB_WIDTHS.map((w) => thumbnailKey(bucketPicturePrefix + picture, w)).filter((k): k is string => k !== null);
	const results = await Promise.allSettled(keys.map((key) => Bucket.delete(key)));
	for (const r of results) if (r.status === "rejected") console.warn("Teacher thumbnail delete failed:", r.reason);
}

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

// Columns safe to serve without a session (mirror of z_PublicTeacher): never ΑΜΚΑ, phone or email.
const publicTeacherColumns = "id, fullname, picture, cv, linktree, gender, title, visible, online";
type PublicTeacher = Omit<Teachers, "amka" | "email" | "telephone">;

export const teachersRoutes = {
	get: new APIServer({ method: "GET", path: "/teachers", responseSchema: z.array(z_Teachers) }, [authenticateMiddleware], () =>
		handlerResult(() => executeQuery<Teachers>("SELECT * FROM teachers"), "Σφάλμα κατά την ανάκτηση των δασκάλων"),
	),
	getPublic: new APIServer({ method: "GET", path: "/teachers/public", responseSchema: z.array(z_PublicTeacher) }, () =>
		handlerResult(
			() => executeQuery<PublicTeacher>(`SELECT ${publicTeacherColumns} FROM teachers ORDER BY fullname ASC`),
			"Σφάλμα κατά την ανάκτηση των δασκάλων",
		),
	),
	getById: new APIServer({ method: "POST", path: "/teachers/id", schema: z_IdArray, responseSchema: z_Teachers }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			const [id] = body;
			const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id=?", [id]);
			if (!teacher) throw APIError.notFound("Ο καθηγητής δεν βρέθηκε");
			return teacher;
		}, "Σφάλμα κατά την ανάκτηση του δασκάλου"),
	),
	getByPriorityClasses: new APIServer(
		{ method: "GET", path: "/teachers/priority/[class_type:string]", responseSchema: z.array(z_PublicTeacher) },
		({ params }) =>
			handlerResult(() => {
				const class_id = ["byz", "par", "eur"].findIndex((v) => v === params.class_type);
				if (class_id === -1) throw APIError.badRequest("Μη έγκυρος τύπος μουσικής");
				return executeQuery<PublicTeacher>(
					`SELECT ${publicTeacherColumns.replace(/(\w+)/g, "t.$1")} FROM teachers as t JOIN teacher_classes as tc ON t.id = tc.teacher_id WHERE tc.class_id=? AND visible=1 ORDER BY tc.priority ASC`,
					[class_id],
				);
			}, "Σφάλμα κατά την ανάκτηση των δασκάλων"),
	),
	getByFullnames: new APIServer({ method: "GET", path: "/teachers/fullnames", responseSchema: z.array(z_Teachers) }, [authenticateMiddleware], () =>
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
				() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes WHERE teacher_id IN (???)", body),
				"Σφάλμα κατά την ανάκτηση των μαθημάτων του δασκάλου",
			),
	),
	getLocations: new APIServer({ method: "GET", path: "/teachers/locations", responseSchema: z.array(z_TeacherLocations) }, () =>
		handlerResult(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations")),
	),
	getLocationsById: new APIServer(
		{ method: "POST", path: "/teachers/locationsById", schema: z_IdArray, responseSchema: z.array(z_TeacherLocations) },
		[authenticateMiddleware],
		({ body }) => handlerResult(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations WHERE teacher_id IN (???)", body)),
	),
	getInstruments: new APIServer({ method: "GET", path: "/teachers/instruments", responseSchema: z.array(z_TeacherInstruments) }, () =>
		handlerResult(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments")),
	),
	getInstrumentsById: new APIServer(
		{ method: "POST", path: "/teachers/instrumentsById", schema: z_IdArray, responseSchema: z.array(z_TeacherInstruments) },
		[authenticateMiddleware],
		({ body }) => handlerResult(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments WHERE teacher_id IN (???)", body)),
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
				const { id } = params;
				const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
				if (!teacher) throw APIError.notFound("Ο καθηγητής δεν βρέθηκε");

				const blob = body;
				if (blob.size > MAX_UPLOAD_BYTES) throw new APIError(HTTP.PAYLOAD_TOO_LARGE, "Το αρχείο είναι πολύ μεγάλο (έως 10 MB)");
				const filetype = blob.type;
				const column = filetype === "application/pdf" ? "cv" : isUploadImageType(filetype) ? "picture" : null;
				if (!column) throw new APIError(HTTP.UNSUPPORTED_MEDIA_TYPE, "Μη υποστηριζόμενος τύπος αρχείου");
				const prefix = column === "cv" ? bucketCVPrefix : bucketPicturePrefix;

				// Replace safely: store the new file under a fresh versioned name, point the row at it, and only then
				// delete the previous file — a failed upload leaves the old one in place.
				const filename = versionedFileName(teacher.fullname, extensionOfType(filetype));
				await Bucket.put(await blob.arrayBuffer(), prefix + filename, filetype);
				await executeQuery(`UPDATE teachers SET ${column} = ? WHERE id = ?`, [filename, id]);
				const previous = teacher[column];
				if (previous && previous !== filename) {
					await Bucket.delete(prefix + previous);
					if (column === "picture") await deletePictureThumbs(previous);
				}
				return column === "cv" ? "Pdf uploaded successfully" : "Image uploaded successfully";
			}, "Σφάλμα κατά την αποθήκευση του αρχείου"),
	),
	fileRename: new APIServer({ method: "PUT", path: "/teachers/file/rename/[id:number]" }, [authenticateMiddleware], ({ params, request }) =>
		handlerResult(async (T) => {
			const { id } = params;
			const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
			if (!teacher) throw APIError.notFound("Ο καθηγητής δεν βρέθηκε");

			// Files follow the teacher's name (`<fullname>-<version>.<ext>`); a renamed teacher's files get the new name
			// with a fresh version. Copy first, point the row at the copy, then delete the old key — a failure at any step
			// leaves the row on a file that exists.
			const newName = safeBaseName(teacher.fullname);
			for (const [column, prefix] of [
				["cv", bucketCVPrefix],
				["picture", bucketPicturePrefix],
			] as const) {
				const current = teacher[column];
				if (!current || fileBaseName(current) === newName) continue;
				const newFileName = versionedFileName(newName, splitFileName(current).ext);
				if (!(await Bucket.copy(prefix + current, prefix + newFileName))) continue;
				await T.executeQuery(`UPDATE teachers SET ${column} = ? WHERE id = ? AND ${column} = ?`, [newFileName, id, current]);
				await Bucket.delete(prefix + current);
				if (column === "picture") await deletePictureThumbs(current);
			}
			return "Files renamed successfully";
		}, "Σφάλμα κατά τη μετονομασία των αρχείων"),
	),
	fileDelete: new APIServer({ method: "PUT", path: "/teachers/file", schema: fileDeleteReq }, [authenticateMiddleware], ({ body, request }) =>
		handlerResult(async (T) => {
			const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
			if (!teacher) throw APIError.notFound("Ο καθηγητής δεν βρέθηκε");
			if (body.type === "cv") {
				if (teacher.cv) await Bucket.delete(bucketCVPrefix + teacher.cv);
				await T.executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
				return "Pdf deleted successfully" as string;
			} else if (body.type === "picture") {
				if (teacher.picture) await Bucket.delete(bucketPicturePrefix + teacher.picture);
				await T.executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
				await deletePictureThumbs(teacher.picture);
				return "Image deleted successfully";
			}
			throw APIError.badRequest("Μη υποστηριζόμενος τύπος αρχείου");
		}, "Σφάλμα κατά τη διαγραφή του αρχείου"),
	),
	delete: new APIServer({ method: "DELETE", path: "/teachers", schema: z_IdArray }, [authenticateMiddleware], ({ body, request }) =>
		handlerResult(async (T) => {
			const ids = body;

			await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (???)`, ids);
			await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (???)`, ids);
			await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (???)`, ids);

			const files = await T.executeQuery<Teachers>(`SELECT cv, picture FROM teachers WHERE id IN (???)`, ids);
			for (const file of files) {
				if (file.cv) await Bucket.delete(bucketCVPrefix + file.cv);
				if (file.picture) await Bucket.delete(bucketPicturePrefix + file.picture);
				await deletePictureThumbs(file.picture);
			}
			await T.executeQuery(`DELETE FROM teachers WHERE id IN (???)`, ids);
			return "Teacher/s deleted successfully";
		}, "Σφάλμα κατά τη διαγραφή του δασκάλου/δασκάλων"),
	),
};

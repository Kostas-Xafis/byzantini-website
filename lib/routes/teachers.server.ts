import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "../../types/entities";
import { Bucket } from "../bucket";
import { deepCopy } from "../utils.client";
import { ImageMIMEType, execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { TeachersRoutes } from "./teachers.client";

const bucketPicturePrefix = "kathigites/picture/";
const bucketCVPrefix = "kathigites/cv/";

// Include this in all .server.ts files
let serverRoutes = deepCopy(TeachersRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"), "Σφάλμα κατά την ανάκτηση των δασκάλων");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id=?", body);
		if (!teacher) throw Error("Teacher not found");
		return teacher;
	}, "Δάσκαλος δεν βρέθηκε");
};

serverRoutes.getByPriorityClasses.func = ({ ctx: _ctx, slug }) => {
	return execTryCatch(() => {
		const class_id = ["byz", "par", "eur"].findIndex(v => v === slug.class_type);
		if (class_id === -1) throw Error("Invalid class type");
		return executeQuery<Teachers>("SELECT t.* FROM teachers as t JOIN teacher_classes as tc ON t.id = tc.teacher_id WHERE tc.class_id=? AND visible=1 ORDER BY tc.priority ASC", [class_id]);
	}, "Σφάλμα κατά την ανάκτηση των δασκάλων");
};

serverRoutes.getByFullnames.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers ORDER BY fullname ASC"), "Σφάλμα κατά την ανάκτηση των δασκάλων");
};

// TeachersClasses endpoints
serverRoutes.getClasses.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"), "Σφάλμα κατά την ανάκτηση των μαθημάτων των δασκάλων");
};
serverRoutes.getClassesById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const id = getUsedBody(ctx) || await ctx.request.json();
		return await executeQuery<TeacherClasses>("SELECT * FROM teacher_classes WHERE teacher_id = ?", id);
	}, "Σφάλμα κατά την  ανάκτηση των μαθημάτων του δασκάλου");
};

// TeachersLocations endpoints
serverRoutes.getLocations.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations"));
};
serverRoutes.getLocationsById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const id = getUsedBody(ctx) || await ctx.request.json();
		return await executeQuery<TeacherLocations>("SELECT * FROM teacher_locations WHERE teacher_id = ?", id);
	});
};

// TeachersInstruments endpoints
serverRoutes.getInstruments.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments"));
};
serverRoutes.getInstrumentsById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const id = getUsedBody(ctx) || await ctx.request.json();
		return await executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments WHERE teacher_id = ?", id);
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const { insertId } = await T.executeQuery(`INSERT INTO teachers (fullname, amka, email, telephone, linktree, gender, title, visible, online) VALUES (???)`, body);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			const registration_number = body.registrations_number.shift() || null;
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (???)`, [insertId, class_id, priority, registration_number]);
		}
		for (const location_id of body.teacherLocations) {
			await T.executeQuery(`INSERT INTO teacher_locations (teacher_id, location_id) VALUES (?, ?)`, [insertId, location_id]);
		}
		for (const instrument_id of body.teacherInstruments) {
			await T.executeQuery(`INSERT INTO teacher_instruments (teacher_id, instrument_id) VALUES (?, ?)`, [insertId, instrument_id]);
		}
		return { insertId };
	});
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery(`UPDATE teachers SET fullname=?, amka=?, email=?, telephone=?, linktree=?, gender=?, title=?, visible=?, online=? WHERE id=?`, body);

		await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			const registration_number = body.registrations_number.shift() || null;
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (???)`, [body.id, class_id, priority, registration_number]);
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
	}, "Σφάλμα κατά την ανανέωση του δασκάλου");
};

serverRoutes.fileUpload.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { id } = slug;
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", slug);
		if (!teacher) throw Error("Teacher not found");

		const blob = await ctx.request.blob();
		const filetype = blob.type;
		const body = await blob.arrayBuffer();

		const filename = teacher.fullname + "." + filetype.split("/")[1];

		if (filetype === "application/pdf") {
			const link = bucketCVPrefix + filename;

			await Bucket.put(ctx, body, link, filetype);
			await executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [filename, id]);
			return "Pdf uploaded successfully";
		} else if (ImageMIMEType.includes(filetype)) {
			const link = bucketPicturePrefix + filename;

			await Bucket.put(ctx, body, link, filetype);
			await executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [filename, id]);
			return "Image uploaded successfully";
		}
		throw Error("Μη υποστηριζόμενος τύπος αρχείου");
	}, "Σφάλμα κατά την αποθήκευση του αρχείου");
};

serverRoutes.fileRename.func = ({ ctx, slug }) => {
	return execTryCatch(async T => {
		const { id } = slug;
		const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
		if (!teacher) throw Error("Teacher not found");

		const oldNameCV = (teacher.cv) && teacher.cv.split(".")[0];
		const oldNameImg = (teacher.picture) && teacher.picture.split(".")[0];
		const newName = teacher.fullname;
		if (teacher.cv && oldNameCV !== newName) {
			const newFileName = newName + "." + teacher.cv.split(".").at(-1);
			await Bucket.move(ctx, bucketCVPrefix + teacher.cv, bucketCVPrefix + newFileName);
			await T.executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [newFileName, id]);
		}
		if (teacher.picture && oldNameImg !== newName) {
			const imageFileType = teacher.picture.split(".").at(-1) as string;
			const newFileName = newName + "." + imageFileType;
			await Bucket.move(ctx, bucketPicturePrefix + teacher.picture, bucketPicturePrefix + newFileName);
			await T.executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [newFileName, id]);
		}
		return "Files renamed successfully";
	},
		"Σφάλμα κατά την μετονομασία των αρχείων");
};

serverRoutes.fileDelete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const [teacher] = await T.executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
		if (!teacher) throw Error("Teacher not found");
		if (body.type === "cv") {
			if (teacher.cv) await Bucket.delete(ctx, bucketCVPrefix + teacher.cv);
			await T.executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
			return "Pdf deleted successfully" as string;
		} else if (body.type === "picture") {
			if (teacher.picture) await Bucket.delete(ctx, bucketPicturePrefix + teacher.picture);
			await T.executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
			return "Image deleted successfully";
		}
		throw Error("Μη υποστηριζόμενος τύπος αρχείου");
	}, "Σφάλμα κατά την διαγραφή του αρχείου");
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();

		await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (???)`, body);
		await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (???)`, body);
		await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (???)`, body);

		const files = await T.executeQuery<Teachers>(`SELECT cv, picture FROM teachers WHERE id IN (???)`, body);
		for (const file of files) {
			if (file.cv) await Bucket.delete(ctx, bucketCVPrefix + file.cv);
			if (file.picture) await Bucket.delete(ctx, bucketPicturePrefix + file.picture);
		}
		await T.executeQuery(`DELETE FROM teachers WHERE id IN (???)`, body);
		return "Teacher/s deleted successfully";
	}, "Σφάλμα κατά την διαγραφή του δασκάλου/δασκάλων");
};

export const TeachersServerRoutes = serverRoutes;

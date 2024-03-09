import type { TeacherClasses, TeacherInstruments, TeacherLocations, Teachers } from "../../types/entities";
import { Bucket } from "../bucket";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, ImageMIMEType, questionMarks } from "../utils.server";
import { TeachersRoutes } from "./teachers.client";

const bucketPicturePrefix = "kathigites/picture/";
const bucketCVPrefix = "kathigites/cv/";

// Include this in all .server.ts files
let serverRoutes = deepCopy(TeachersRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"));
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", ids);
		if (!teacher) throw Error("Teacher not found");
		return teacher;
	});
};

serverRoutes.getByPriorityClasses.func = ({ ctx: _ctx, slug }) => {
	const class_id = ["byz", "par", "eur"].findIndex(v => v === slug.class_type);
	if (class_id === -1) throw Error("Invalid class type");
	return execTryCatch(() =>
		executeQuery<Teachers>("SELECT t.* FROM teachers as t JOIN teacher_classes as tc ON t.id = tc.teacher_id WHERE tc.class_id=? AND visible=1 ORDER BY tc.priority ASC", [class_id])
	);
};

serverRoutes.getByFullnames.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers ORDER BY fullname ASC"));
};

// TeachersClasses endpoints
serverRoutes.getClasses.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"));
};
serverRoutes.getClassesById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const id = getUsedBody(ctx) || await ctx.request.json();
		return await executeQuery<TeacherClasses>("SELECT * FROM teacher_classes WHERE teacher_id = ?", id);
	});
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
		const args = [body.fullname, body.email, body.telephone, body.linktree, body.gender, body.title, body.visible, body.online];
		const id = await T.executeQuery(`INSERT INTO teachers (fullname, email, telephone, linktree, gender, title, visible, online) VALUES (${questionMarks(args)})`, args);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			const registration_number = body.registrations_number.shift() || null;
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (${questionMarks(4)})`, [id.insertId, class_id, priority, registration_number]);
		}
		for (const location_id of body.teacherLocations) {
			await T.executeQuery(`INSERT INTO teacher_locations (teacher_id, location_id) VALUES (?, ?)`, [id.insertId, location_id]);
		}
		for (const instrument_id of body.teacherInstruments) {
			await T.executeQuery(`INSERT INTO teacher_instruments (teacher_id, instrument_id) VALUES (?, ?)`, [id.insertId, instrument_id]);
		}
		return { insertId: id.insertId };
	});
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = [body.fullname, body.email, body.telephone, body.linktree, body.gender, body.title, body.visible, body.online, body.id];
		await T.executeQuery(`UPDATE teachers SET fullname=?, email=?, telephone=?, linktree=?, gender=?, title=?, visible=?, online=? WHERE id=?`, args);

		await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			const registration_number = body.registrations_number.shift() || null;
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority, registration_number) VALUES (${questionMarks(4)})`, [body.id, class_id, priority, registration_number]);
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
	});
};

serverRoutes.fileUpload.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { id } = slug;
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
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
		throw Error("Invalid filetype");
	});
};

serverRoutes.fileRename.func = ({ ctx, slug }) => {
	return execTryCatch(async (T) => {
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
	});
};

serverRoutes.fileDelete.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
		if (!teacher) throw Error("Teacher not found");
		if (body.type === "cv") {
			if (teacher.cv) await Bucket.delete(ctx, bucketCVPrefix + teacher.cv);
			await executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
			return "Pdf deleted successfully" as string;
		} else if (body.type === "picture") {
			if (teacher.picture) await Bucket.delete(ctx, bucketPicturePrefix + teacher.picture);
			await executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
			return "Image deleted successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (${questionMarks(body)})`, body);
		await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (${questionMarks(body)})`, body);
		await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (${questionMarks(body)})`, body);

		const files = await T.executeQuery<Pick<Teachers, "cv" | "picture">>(
			`SELECT cv, picture FROM teachers WHERE id IN (${questionMarks(body)})`,
			body
		);
		for (const file of files) {
			if (file.cv) await Bucket.delete(ctx, bucketCVPrefix + file.cv);
			if (file.picture) await Bucket.delete(ctx, bucketPicturePrefix + file.picture);
		}
		await T.executeQuery(`DELETE FROM teachers WHERE id IN (${questionMarks(body)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const TeachersServerRoutes = serverRoutes;

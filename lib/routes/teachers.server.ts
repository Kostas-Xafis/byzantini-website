import type { TeacherClasses, TeacherLocations, Teachers, TeacherInstruments } from "../../types/entities";
import { TeachersRoutes } from "./teachers.client";
import { execTryCatch, executeQuery, generateLink, questionMarks } from "../utils.server";
import { Bucket } from "../bucket";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(TeachersRoutes)) as typeof TeachersRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", ids);
		if (!teacher) throw Error("Teacher not found");
		return teacher;
	});
};

serverRoutes.getByPriorityClasses.func = async (_ctx, slug) => {
	const class_id = ["byz", "par", "eur"].findIndex(v => v === slug.class_type);
	if (class_id === -1) throw Error("Invalid class type");
	return await execTryCatch(() => executeQuery<Teachers>("SELECT t.* FROM teachers as t JOIN teacher_classes as tc ON t.id = tc.teacher_id WHERE tc.class_id=? AND visible=1 ORDER BY tc.priority ASC, fullname ASC", [class_id]));
};

serverRoutes.getByFullnames.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers ORDER BY fullname ASC"));
};

serverRoutes.getClasses.func = async _ctx => {
	return await execTryCatch(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"));
};

serverRoutes.getLocations.func = async _ctx => {
	return await execTryCatch(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations"));
};

serverRoutes.getInstruments.func = async ctx => {
	return await execTryCatch(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments"));
};

serverRoutes.post.func = async ctx => {
	return await execTryCatch(async T => {
		const body = await ctx.request.json();
		const args = [body.fullname, body.email, body.telephone, body.linktree, body.gender, body.title, body.visible, body.online];
		const id = await T.executeQuery(`INSERT INTO teachers (fullname, email, telephone, linktree, gender, title, visible, online) VALUES (${questionMarks(args)})`, args);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority) VALUES (?, ?, ?)`, [id.insertId, class_id, priority]);
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

serverRoutes.update.func = async ctx => {
	return await execTryCatch(async T => {
		const body = await ctx.request.json();
		const args = [body.fullname, body.email, body.telephone, body.linktree, body.gender, body.title, body.visible, body.online, body.id];
		await T.executeQuery(`UPDATE teachers SET fullname=?, email=?, telephone=?, linktree=?, gender=?, title=?, visible=?, online=? WHERE id=?`, args);
		await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
		for (const class_id of body.teacherClasses) {
			const priority = body.priorities.shift();
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id, priority) VALUES (?, ?, ?)`, [body.id, class_id, priority]);
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

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.fileUpload.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
		if (!teacher) throw Error("Teacher not found");
		const blob = await ctx.request.blob();
		const filetype = blob.type;
		const body = await blob.arrayBuffer();
		const link = generateLink(12) + "." + filetype.split("/")[1];
		if (filetype === "application/pdf") {
			if (teacher.cv) await Bucket.delete(ctx, teacher.cv);
			await Bucket.put(ctx, body, link, filetype);
			await executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [link, id]);
			return "Pdf uploaded successfully";
		} else if (imageMIMEType.includes(filetype)) {
			if (teacher.picture) Bucket.delete(ctx, teacher.picture);
			await Bucket.put(ctx, body, link, filetype);
			await executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [link, id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.fileDelete.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
		if (!teacher) throw Error("Teacher not found");
		if (body.type === "cv") {
			if (teacher.cv) await Bucket.delete(ctx, teacher.cv);
			await executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
			return "Pdf deleted successfully";
		} else if (body.type === "picture") {
			if (teacher.picture) await Bucket.delete(ctx, teacher.picture);
			await executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
			return "Image deleted successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = async ctx => {
	return await execTryCatch(async T => {
		const body = await ctx.request.json();
		await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (${questionMarks(body)})`, body);
		await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (${questionMarks(body)})`, body);
		await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (${questionMarks(body)})`, body);

		const files = await T.executeQuery<Pick<Teachers, "cv" | "picture">>(
			`SELECT cv, picture FROM teachers WHERE id IN (${questionMarks(body)})`,
			body
		);
		for (const file of files) {
			if (file.cv) await Bucket.delete(ctx, file.cv);
			if (file.picture) await Bucket.delete(ctx, file.picture);
		}
		await T.executeQuery(`DELETE FROM teachers WHERE id IN (${questionMarks(body)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const TeachersServerRoutes = serverRoutes;

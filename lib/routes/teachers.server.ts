import type { TeacherClasses, Locations, TeacherLocations, Teachers, TeacherInstruments } from "../../types/entities";
import { TeachersRoutes } from "./teachers.client";
import { Transaction, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import { Bucket } from "../bucket";

// TODO: REFACTOR INSERT/UPDATE/DELETE to account for the teachers_locations table

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(TeachersRoutes)) as typeof TeachersRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"));
};

serverRoutes.getByPriority.func = async _req => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers ORDER BY priority ASC, fullname ASC"));
};

serverRoutes.getClasses.func = async _req => {
	return await execTryCatch(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"));
}

serverRoutes.getLocations.func = async _req => {
	return await execTryCatch(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations"));
}

serverRoutes.getInstruments.func = async req => {
	return await execTryCatch(() => executeQuery<TeacherInstruments>("SELECT * FROM teacher_instruments"));
}

serverRoutes.post.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const args = [body.fullname, body.priority]
		const id = await T.executeQuery(`INSERT INTO teachers (fullname, priority) VALUES (?, ?)`, args);
		for (const class_id of body.teacherClasses) {
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)`, [id.insertId, class_id]);
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

serverRoutes.update.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const args = [body.fullname, body.priority, body.id];
		await T.executeQuery(`UPDATE teachers SET fullname=?, priority=? WHERE id=?`, args);
		await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
		for (const class_id of body.teacherClasses) {
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)`, [body.id, class_id]);
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
serverRoutes.fileUpload.func = async (req, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [id]);
		if (!teacher) throw Error("Teacher not found");
		const blob = await req.blob();
		const filetype = blob.type;
		const body = await blob.arrayBuffer();
		const link = generateLink(12) + "." + filetype.split("/")[1];
		if (filetype === "application/pdf") {
			if (teacher.cv) await Bucket.delete(req, teacher.cv);
			await Bucket.put(req, body, link, filetype);
			await executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [link, id]);
			return "Pdf uploaded successfully";
		} else if (imageMIMEType.includes(filetype)) {
			if (teacher.picture) Bucket.delete(req, teacher.picture);
			await Bucket.put(req, body, link, filetype);
			await executeQuery(`UPDATE teachers SET picture = ? WHERE id = ?`, [link, id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.fileDelete.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const [teacher] = await executeQuery<Teachers>("SELECT * FROM teachers WHERE id = ?", [body.id]);
		if (!teacher) throw Error("Teacher not found");
		if (body.type === "cv") {
			if (teacher.cv) await Bucket.delete(req, teacher.cv);
			await executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
			return "Pdf deleted successfully";
		} else if (body.type === "picture") {
			if (teacher.picture) await Bucket.delete(req, teacher.picture);
			await executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
			return "Image deleted successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		await T.executeQuery(`DELETE FROM teacher_classes WHERE teacher_id IN (${questionMarks(body.length)})`, body);
		await T.executeQuery(`DELETE FROM teacher_locations WHERE teacher_id IN (${questionMarks(body.length)})`, body);
		await T.executeQuery(`DELETE FROM teacher_instruments WHERE teacher_id IN (${questionMarks(body.length)})`, body);

		const files = await T.executeQuery<Pick<Teachers, "cv" | "picture">>(
			`SELECT cv, picture FROM teachers WHERE id IN (${questionMarks(body.length)})`,
			body
		);
		for (const file of files) {
			if (file.cv) await Bucket.delete(req, file.cv);
			if (file.picture) await Bucket.delete(req, file.picture);
		}
		await T.executeQuery(`DELETE FROM teachers WHERE id IN (${questionMarks(body.length)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const TeachersServerRoutes = serverRoutes;

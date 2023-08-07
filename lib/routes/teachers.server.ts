import type { TeacherClasses, Locations, TeacherLocations, Teachers } from "../../types/entities";
import { TeachersRoutes } from "./teachers.client";
import { Transaction, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import { Bucket } from "../bucket";

// TODO: REFACTOR INSERT/UPDATE/DELETE to account for the teachers_locations table

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(TeachersRoutes)) as typeof TeachersRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"));
};

serverRoutes.getClasses.func = async _req => {
	return await execTryCatch(() => executeQuery<TeacherClasses>("SELECT * FROM teacher_classes"));
}

serverRoutes.getLocations.func = async _req => {
	return await execTryCatch(() => executeQuery<TeacherLocations>("SELECT * FROM teacher_locations"));
}

serverRoutes.post.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const args = [body.fullname, body.email, body.cellphone, body.priority]
		const id = await T.executeQuery(`INSERT INTO teachers (fullname, email, cellphone, priority) VALUES (?, ?, ?, ?)`, args);
		for (const class_id of body.teacherClasses) {
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)`, [id.insertId, class_id]);
		}
		return { insertId: id.insertId };
	});
};

serverRoutes.update.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const args = [body.fullname, body.email, body.cellphone, body.priority, body.id];
		await T.executeQuery(`UPDATE teachers SET fullname=?, email=?, cellphone=?, priority=? WHERE id=?`, args);
		await T.executeQuery("DELETE FROM teacher_classes WHERE teacher_id=?", [body.id]);
		for (const class_id of body.teacherClasses) {
			await T.executeQuery(`INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)`, [body.id, class_id]);
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
		await T.executeQuery(`DELETE FROM TeacherClasses WHERE teacher_id IN (${questionMarks(body.length)})`, body);
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

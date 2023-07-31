import type { Teachers } from "../../types/entities";
import { TeachersRoutes } from "./teachers.client";
import { Transaction, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import { bucketFileUpload } from "../bucket/fileUpload";
import { bucketFileDelete } from "../bucket/fileDelete";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(TeachersRoutes)) as typeof TeachersRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Teachers>("SELECT * FROM teachers"));
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const args = Object.values(body);
		const id = await executeQuery(`INSERT INTO teachers (fullname, email, cellphone) VALUES (${questionMarks(args.length)})`, args);
		return { insertId: id.insertId };
	});
};

serverRoutes.update.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const args = Object.values(body);
		await executeQuery(`UPDATE teachers SET fullname=?, email=?, cellphone=? WHERE id=?`, [...args.slice(1), body.id]);
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
			if (teacher.cv) await bucketFileDelete(teacher.cv);
			await bucketFileUpload(Buffer.from(body), link, filetype);
			await executeQuery(`UPDATE teachers SET cv = ? WHERE id = ?`, [link, id]);
			return "Pdf uploaded successfully";
		} else if (imageMIMEType.includes(filetype)) {
			if (teacher.picture) bucketFileDelete(teacher.picture);
			await bucketFileUpload(Buffer.from(body), link, filetype);
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
			if (teacher.cv) await bucketFileDelete(teacher.cv);
			await executeQuery(`UPDATE teachers SET cv = NULL WHERE id = ?`, [body.id]);
			return "Pdf deleted successfully";
		} else if (body.type === "picture") {
			if (teacher.picture) await bucketFileDelete(teacher.picture);
			await executeQuery(`UPDATE teachers SET picture = NULL WHERE id = ?`, [body.id]);
			return "Image deleted successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.delete.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		await T.execute(`DELETE FROM classes WHERE teacher_id IN (${questionMarks(body.length)})`, body);
		const files = await T.execute<Pick<Teachers, "cv" | "picture">>(
			`SELECT cv, picture FROM teachers WHERE id IN (${questionMarks(body.length)})`,
			body
		);
		for (const file of files) {
			if (file.cv) await bucketFileDelete(file.cv);
			if (file.picture) await bucketFileDelete(file.picture);
		}
		await T.execute(`DELETE FROM teachers WHERE id IN (${questionMarks(body.length)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const TeachersServerRoutes = serverRoutes;

import type { ClassType } from "../../types/entities";
import { ClassTypeRoutes } from "./classtype.client";
import { execTryCatch, executeQuery, questionMarks } from "../utils";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(ClassTypeRoutes)) as typeof ClassTypeRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<ClassType>("SELECT * FROM class_type"));
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const id = await executeQuery(`INSERT INTO class_type (name) VALUES (?)`, [body.name]);
		return { insertId: id.insertId };
	});
};

serverRoutes.delete.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		await executeQuery(`DELETE FROM class_type WHERE id IN (${questionMarks(body.length)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const ClassTypeServerRoutes = serverRoutes;

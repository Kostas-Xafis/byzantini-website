import type { Instruments } from "../../types/entities";
import { InstrumentsRoutes } from "./instruments.client";
import { execTryCatch, executeQuery, questionMarks } from "../utils";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(InstrumentsRoutes)) as typeof InstrumentsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Instruments>("SELECT * FROM instruments ORDER BY name ASC"));
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const id = await executeQuery(`INSERT INTO instruments (name) VALUES (?)`, [body.name]);
		return { insertId: id.insertId };
	});
};

serverRoutes.delete.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		await executeQuery(`DELETE FROM instruments WHERE id IN (${questionMarks(body.length)})`, body);
		return "Teacher/s deleted successfully";
	});
};

export const ClassTypeServerRoutes = serverRoutes;

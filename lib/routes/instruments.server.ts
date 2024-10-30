import type { Instruments } from "../../types/entities";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { InstrumentsRoutes } from "./instruments.client";

// Include this in all .server.ts files
let serverRoutes = deepCopy(InstrumentsRoutes); // Copy the routes object to split it into client and server routes

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Instruments>("SELECT * FROM instruments ORDER BY name ASC"), "Σφάλμα κατά την ανάκτηση των μουσικών οργάνων");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const id = getUsedBody(ctx) || await ctx.request.json();
		const [instrument] = await executeQuery<Instruments>("SELECT * FROM instruments WHERE id = ? LIMIT 1", id);
		if (!instrument) throw Error("Instrument not found");
		return instrument;
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const args = Object.values(body);
		const id = await T.executeQuery(`INSERT INTO instruments (name, type, isInstrument) VALUES (?, ?, ?)`, args);
		return id;
	}, "Σφάλμα κατά την προσθήκη του μουσικού οργάνου");
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery(`DELETE FROM instruments WHERE id IN (${questionMarks(body)})`, body);
		return "Teacher/s deleted successfully";
	}, "Σφάλμα κατά την διαγραφή του μουσικού οργάνου");
};

export const ClassTypeServerRoutes = serverRoutes;

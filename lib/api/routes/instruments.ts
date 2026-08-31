import { z } from "astro/zod";
import type { Instruments } from "@_types/entities";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_Instruments } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Instruments — Phase 4 port (contracts + handlers in one place).
 * Ported from lib/routes/instruments.client|server.ts.
 */

const postReq = z_Instruments.omit({ id: true });
const idListReq = z.array(z.number().int());

export const instrumentsRoutes = {
	// GET /instruments — authentication: false
	get: new APIServer(
		{ method: "GET", path: "/instruments", responseSchema: z.array(z_Instruments) },
		() =>
			handlerResult(
				() => executeQuery<Instruments>("SELECT * FROM instruments ORDER BY name ASC"),
				"Σφάλμα κατά την ανάκτηση των μουσικών οργάνων",
			),
	),
	// POST /instruments — authentication: true
	post: new APIServer(
		{ method: "POST", path: "/instruments", schema: postReq, responseSchema: z.object({ insertId: z.number().int() }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const args = Object.values(body);
				const id = await T.executeQuery(`INSERT INTO instruments (name, type, isInstrument) VALUES (?, ?, ?)`, args);
				return id;
			}, "Σφάλμα κατά την προσθήκη του μουσικού οργάνου"),
	),
	// POST /instruments/id — authentication: false
	getById: new APIServer(
		{ method: "POST", path: "/instruments/id", schema: idListReq, responseSchema: z_Instruments },
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [instrument] = await executeQuery<Instruments>("SELECT * FROM instruments WHERE id = ? LIMIT 1", [id]);
				if (!instrument) throw Error("Instrument not found");
				return instrument;
			}),
	),
	// DELETE /instruments — authentication: true
	delete: new APIServer(
		{ method: "DELETE", path: "/instruments", schema: idListReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const ids = body as number[];
				await T.executeQuery(`DELETE FROM instruments WHERE id IN (${questionMarks(ids)})`, ids);
				return "Teacher/s deleted successfully";
			}, "Σφάλμα κατά την διαγραφή του μουσικού οργάνου"),
	),
};

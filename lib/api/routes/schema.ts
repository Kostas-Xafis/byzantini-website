import { sqliteGenerateBackup } from "@lib/routes/schema.server";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Schema — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/schema.client|server.ts.
 *
 * Route key (`get`) mirrors the old `SchemaRoutes` exactly. The only remaining
 * route is the D1 sqlite backup; the retired `revertToPreviousSchema` / `migrate`
 * (fs + connector based) are handled by `wrangler d1 migrations`.
 */
export const schemaRoutes = {
	get: new APIServer(
		{ method: "GET", path: '/schema/backup/[type:"mysql" | "sqlite"]' },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(() => {
				const { type } = params;
				if (type === "sqlite") {
					return sqliteGenerateBackup();
				} else if (type === "mysql") {
					throw Error("MySQL is not supported anymore");
				}
				throw Error(`The ${type} connector not supported`);
			}, "Σφάλμα κατά την ανάκτηση του σχήματος"),
	),
};

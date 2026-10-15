import { ACTIVITY_GROUPS } from "@lib/activity/labels";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z } from "astro/zod";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware, requirePermission } from "./middleware/authenticate";

/**
 * Activity — «Ιστορικό ενεργειών» (sysadmin and owner): the changes admins made, newest first
 * (`sys_activity`, written by lib/activity/record.server.ts).
 */

const PAGE_SIZE = 50;

const z_ActivityRow = z.object({
	id: z.number(),
	created_at: z.number(),
	user_email: z.string(),
	endpoint: z.string(),
	label: z.string(),
	summary: z.string().nullable(),
});

const z_ActivityQuery = z.object({
	/** Cursor: only rows older than this id (the previous page's `next`). */
	before: z.number().int().positive().optional(),
	user_email: z.string().optional(),
	/** A category of ACTIVITY_GROUPS (e.g. «Βιβλία»). */
	category: z.string().optional(),
});

export const activityRoutes = {
	list: new APIServer(
		{ method: "POST", path: "/activity", schema: z_ActivityQuery, responseSchema: z.object({ rows: z.array(z_ActivityRow), next: z.number().nullable() }) },
		[authenticateMiddleware, requirePermission("activityLog")],
		({ body }) =>
			handlerResult(async () => {
				const where: string[] = [];
				const args: (string | number)[] = [];
				if (body.before) {
					where.push("id < ?");
					args.push(body.before);
				}
				if (body.user_email) {
					where.push("user_email = ?");
					args.push(body.user_email);
				}
				if (body.category) {
					const groups = Object.entries(ACTIVITY_GROUPS)
						.filter(([, name]) => name === body.category)
						.map(([group]) => group);
					if (groups.length === 0) return { rows: [], next: null };
					where.push(`substr(endpoint, 1, instr(endpoint, '.') - 1) IN (${questionMarks(groups)})`);
					args.push(...groups);
				}
				const rows = await executeQuery<z.infer<typeof z_ActivityRow>>(
					`SELECT id, created_at, user_email, endpoint, label, summary FROM sys_activity ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`,
					[...args, PAGE_SIZE + 1],
				);
				const page = rows.slice(0, PAGE_SIZE);
				return { rows: page, next: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null };
			}, "Σφάλμα κατά την ανάκτηση του ιστορικού"),
	),
	/** Everyone who appears in the log (the admin filter), deleted admins included. */
	admins: new APIServer(
		{ method: "GET", path: "/activity/admins", responseSchema: z.array(z.string()) },
		[authenticateMiddleware, requirePermission("activityLog")],
		() =>
			handlerResult(async () => {
				const rows = await executeQuery<{ user_email: string }>("SELECT DISTINCT user_email FROM sys_activity ORDER BY user_email");
				return rows.map((row) => row.user_email);
			}, "Σφάλμα κατά την ανάκτηση του ιστορικού"),
	),
};

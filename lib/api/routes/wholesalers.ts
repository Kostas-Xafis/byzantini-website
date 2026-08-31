import { z } from "astro/zod";
import type { Books, Payments, Wholesalers } from "@_types/entities";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_Wholesalers } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Wholesalers — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/wholesalers.client|server.ts.
 * Route keys (get, post, getById, delete) match the old client file exactly.
 */

const postReq = z_Wholesalers.omit({ id: true });

export const wholesalersRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/wholesalers", responseSchema: z.array(z_Wholesalers) },
		[authenticateMiddleware],
		() =>
			handlerResult(
				() => executeQuery<Wholesalers>("SELECT * FROM wholesalers"),
				"Σφάλμα κατά την ανάκτηση των χονδρεμπόρων",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/wholesalers/id", responseSchema: z_Wholesalers },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [wholesaler] = await executeQuery<Wholesalers>("SELECT * FROM wholesalers WHERE id = ?", [id]);
				if (!wholesaler) throw Error("Wholesaler not found");
				return wholesaler;
			}),
	),
	post: new APIServer(
		{ method: "POST", path: "/wholesalers", schema: postReq, responseSchema: z.object({ insertId: z.number() }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const args = Object.values(body);
				const result = await T.executeQuery(`INSERT INTO wholesalers (name) VALUES (?)`, args);
				await T.executeQuery("INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (?, 0)", [result.insertId]);
				return result;
			}, "Σφάλμα κατά την προσθήκη του χονδρεμπόρου"),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/wholesalers" },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const wholesaler_id = body as number[];
				const wholesaler = (await T.executeQuery<Wholesalers>(`SELECT * FROM wholesalers WHERE id=?`, wholesaler_id))[0] || null;
				if (!wholesaler) throw Error("Wholesaler not found");
				await T.executeQuery(`UPDATE total_school_payoffs SET amount = amount - (SELECT SUM(amount) FROM school_payoffs WHERE wholesaler_id=?)`, wholesaler_id);
				await T.executeQuery("DELETE FROM school_payoffs WHERE wholesaler_id=?", wholesaler_id);
				const bookList = await T.executeQuery<Books>("SELECT * FROM books WHERE wholesaler_id=?", wholesaler_id);

				await T.executeQuery("DELETE FROM books WHERE wholesaler_id=?", wholesaler_id);
				if (bookList.length) {
					const bookIds = bookList.map((book) => book.id);
					const payments = await T.executeQuery<Payments>(
						`SELECT * FROM payments WHERE book_id IN (${questionMarks(bookList)}) AND payment_date = 0`,
						bookIds,
					);
					if (payments.length > 0) {
						let sum = 0;
						for (const payment of payments) {
							sum += (bookList.find((book) => book.id === payment.book_id)?.price || 0) * payment.book_amount;
						}
						await T.executeQuery(`UPDATE total_payments SET amount = amount - ?`, [sum]);
						await T.executeQuery(`DELETE FROM payments WHERE book_id IN (${questionMarks(bookList)})`, bookIds);
					}
				}
				await T.executeQuery(`DELETE FROM wholesalers WHERE id=?`, wholesaler_id);
				return "Deleted wholesalers successfully";
			}, "Σφάλμα κατά την διαγραφή του χονδρεμπόρου"),
	),
};

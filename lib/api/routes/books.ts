import { z } from "astro/zod";
import type { Books, Payments } from "@_types/entities";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_Books } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Books — Phase 4 reference route group (contracts + handlers in one place).
 * Ported from lib/routes/books.client|server.ts.
 */

const postReq = z_Books.omit({ id: true });
const quantityReq = z_Books.pick({ id: true, quantity: true });

export const booksRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/books", responseSchema: z.array(z_Books) },
		[authenticateMiddleware],
		() =>
			handlerResult(
				() => executeQuery<Books>("SELECT * FROM books"),
				"Σφάλμα κατά την ανάκτηση των βιβλίων",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/books/id", responseSchema: z_Books },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [book] = await executeQuery<Books>("SELECT * FROM books WHERE id = ?", [id]);
				if (!book) throw Error("Book not found");
				return book;
			}, "Σφάλμα κατά την ανάκτηση του βιβλίου"),
	),
	post: new APIServer(
		{ method: "POST", path: "/books", schema: postReq, responseSchema: z.object({ insertId: z.number() }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const res = await T.executeQuery(
					`INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES (${questionMarks(body)})`,
					body,
				);
				// Update school_payoffs table amount
				await Promise.all([
					T.executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [body.wholesale_price * body.quantity, body.wholesaler_id]),
					T.executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [body.wholesale_price * body.quantity]),
				]);
				return res;
			}, "Σφάλμα κατά την προσθήκη του βιβλίου"),
	),
	updateQuantity: new APIServer(
		{ method: "PUT", path: "/books/updateQuantity", schema: quantityReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const reqBook = body;
				const [book] = await T.executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [reqBook.id]);
				if (book.quantity > reqBook.quantity) throw Error("Cannot reduce quantity");
				const newAddedAmount = book.wholesale_price * (reqBook.quantity - book.quantity);
				await Promise.all([
					T.executeQuery(`UPDATE books SET quantity = ? WHERE id = ?`, reqBook),
					// Update school_payoffs table amount
					T.executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [newAddedAmount, book.wholesaler_id]),
					T.executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [newAddedAmount]),
				]);
				return "Quantity updated successfully";
			}, "Σφάλμα κατά την ενημέρωση της ποσότητας του βιβλίου"),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/books" },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const ids = body as number[];
				const books = await T.executeQuery<Books>(`SELECT * FROM books WHERE id IN (${questionMarks(ids)})`, ids);
				if (books.length === 0) throw Error("Book not found");

				if (ids.length === 1) await T.executeQuery(`DELETE FROM books WHERE id = ?`, ids);
				else await T.executeQuery(`DELETE FROM books WHERE id IN (${questionMarks(ids)})`, ids);

				// Update payments table & total amount
				const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE book_id IN (${questionMarks(ids)}) AND payment_date = 0`, ids);
				let sum = 0;
				for (const payment of payments) {
					sum += (books.find((book) => book.id === payment.book_id)?.price || 0) * payment.book_amount;
				}
				await T.executeQuery(`UPDATE total_payments SET amount = amount - ?`, [sum]);
				await T.executeQuery<Payments>(`DELETE FROM payments WHERE book_id IN (${questionMarks(ids)})`, ids);

				return "Book deleted successfully";
			}, "Σφάλμα κατά την διαγραφή του βιβλίου"),
	),
};

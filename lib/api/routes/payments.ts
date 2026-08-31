import { z } from "astro/zod";
import type { Books, Payments } from "@_types/entities";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_Payments } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Payments — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/payments.client|server.ts.
 *
 * Route keys mirror the old `PaymentsRoutes` ("Payments.get", "Payments.post", ...).
 */

const postReq = z_Payments.omit({ id: true, amount: true, date: true });
const updatePaymentReq = z_Payments.pick({ id: true, amount: true });
const idsReq = z.array(z.number().int().min(0, "Μη έγκυρο id"));

const insertResponse = z.object({ insertId: z.number().int().min(0, "Μη έγκυρο insertId") });

export const paymentsRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/payments", responseSchema: z.array(z_Payments) },
		[authenticateMiddleware],
		() =>
			handlerResult(
				() => executeQuery<Payments>("SELECT * FROM payments ORDER BY date DESC"),
				"Σφάλμα κατά την ανάκτηση των πληρωμών",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/payments/id", schema: idsReq, responseSchema: z.array(z_Payments) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const ids = body as number[];
				const payments = await executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)})`, ids);
				if (!payments) throw Error("Payment not found");
				return payments;
			}),
	),
	getTotal: new APIServer(
		{ method: "GET", path: "/payments/total", responseSchema: z.object({ total: z.number() }) },
		[authenticateMiddleware],
		() =>
			handlerResult(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_payments"))[0]),
	),
	post: new APIServer(
		{ method: "POST", path: "/payments", schema: postReq, responseSchema: insertResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const { book_id, student_name, book_amount } = body;

				const book = (await T.executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [book_id]))[0];

				if (!book) throw new Error("Το βιβλίο δεν βρέθηκε");
				if (book.quantity - book.sold <= 0) throw new Error("Το βιβλίο δεν είναι διαθέσιμο");
				if (book_amount > book.quantity - book.sold) throw new Error("Δεν υπάρχουν αρκετά βιβλία");
				if (book_amount <= 0) throw new Error("Χρειάζεται τουλάχιστον 1 βιβλίο για να πραγματοποιηθεί η αγορά");

				const res = await T.executeQuery(`INSERT INTO payments (book_id, student_name, amount, book_amount, date) VALUES (${questionMarks(5)})`, [
					book_id,
					student_name,
					book.price * book_amount,
					book_amount,
					Date.now(),
				]);

				await T.executeQuery("UPDATE books SET sold = sold + ? WHERE id = ?", [book_amount, book_id]);
				await T.executeQuery("UPDATE total_payments SET amount = amount + ?", [book.price * book_amount]);

				return res;
			}, "Σφάλμα κατά την προσθήκη της πληρωμής"),
	),
	updatePayment: new APIServer(
		{ method: "PUT", path: "/payments", schema: updatePaymentReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const { id, amount } = body;
				//check if payment exists
				const payment = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [id]);
				if (payment.length === 0) {
					throw Error("Payment not found");
				}
				await executeQuery("UPDATE payments SET amount = ? WHERE id = ?", [amount, id]);
				return "Updated payment successfully";
			}, "Σφάλμα κατά την ενημέρωση της πληρωμής"),
	),
	complete: new APIServer(
		{ method: "POST", path: "/payments/complete", schema: idsReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const ids = body as number[];
				//check if payment exists
				const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date = 0`, ids);
				if (payments.length === 0) throw Error("Payment not found");
				await T.executeQuery(
					`UPDATE payments as p SET payment_date = ?, amount = (SELECT price FROM books WHERE books.id=p.book_id)*book_amount WHERE id IN (${questionMarks(ids)})`,
					[Date.now(), ...ids],
				);
				await T.executeQuery(`UPDATE total_payments SET amount = amount - (SELECT SUM(amount) FROM payments WHERE id IN (${questionMarks(ids)}))`, [...ids]);
				return "Completed payment successfully";
			}, "Σφάλμα κατά την ολοκλήρωση της πληρωμής"),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/payments", schema: idsReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const ids = body as number[];

				//check if payment exists
				const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date != 0`, ids);
				if (payments.length === 0) throw Error("Payments not found");
				await T.executeQuery(`DELETE FROM payments WHERE id IN (${questionMarks(ids)})`, ids);
				return "Deleted payment successfully";
			}, "Σφάλμα κατά την διαγραφή της πληρωμής"),
	),
};

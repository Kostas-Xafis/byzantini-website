import type { Books, Payments, Wholesalers } from "../../types/entities";
import { deepCopy } from "../utilities/objects";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { WholesalersRoutes } from "./wholesalers.client";

const serverRoutes = deepCopy(WholesalersRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Wholesalers>("SELECT * FROM wholesalers"), "Σφάλμα κατά την ανάκτηση των χονδρεμπόρων");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [wholesaler] = await executeQuery<Wholesalers>("SELECT * FROM wholesalers WHERE id = ?", [id]);
		if (!wholesaler) throw Error("Wholesaler not found");
		return wholesaler;
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const args = Object.values(getUsedBody(ctx) || await ctx.request.json());
		const result = await T.executeQuery(`INSERT INTO wholesalers (name) VALUES (?)`, args);
		await T.executeQuery("INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (?, 0)", [result.insertId]);
		return result;
	}, "Σφάλμα κατά την προσθήκη του χονδρεμπόρου");
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const wholesaler_id = getUsedBody(ctx) || await ctx.request.json();
		const wholesaler = (await T.executeQuery<Wholesalers>(`SELECT * FROM wholesalers WHERE id=?`, wholesaler_id))[0] || null;
		if (!wholesaler) throw Error("Wholesaler not found");
		await T.executeQuery(`UPDATE total_school_payoffs SET amount = amount - (SELECT SUM(amount) FROM school_payoffs WHERE wholesaler_id=?)`, wholesaler_id);
		await T.executeQuery("DELETE FROM school_payoffs WHERE wholesaler_id=?", wholesaler_id);
		const bookList = await T.executeQuery<Books>("SELECT * FROM books WHERE wholesaler_id=?", wholesaler_id);

		await T.executeQuery("DELETE FROM books WHERE wholesaler_id=?", wholesaler_id);
		if (bookList.length) {
			const bookIds = bookList.map(book => book.id);
			const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE book_id IN (${questionMarks(bookList)}) AND payment_date = 0`, bookIds);
			if (payments.length > 0) {
				let sum = 0;
				for (const payment of payments) {
					sum += (bookList.find(book => book.id === payment.book_id)?.price || 0) * payment.book_amount;
				}
				await T.executeQuery(`UPDATE total_payments SET amount = amount - ?`, [sum]);
				await T.executeQuery(`DELETE FROM payments WHERE book_id IN (${questionMarks(bookList)})`, bookIds);
			}
		}
		await T.executeQuery(`DELETE FROM wholesalers WHERE id=?`, wholesaler_id);
		return "Deleted wholesalers successfully";
	}, "Σφάλμα κατά την διαγραφή του χονδρεμπόρου");
};
export const WholesalersServerRoutes = serverRoutes;

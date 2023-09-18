import type { Books, Wholesalers } from "../../types/entities";
import { type Transaction, execTryCatch, executeQuery, questionMarks } from "../utils.server";
import { WholesalersRoutes } from "./wholesalers.client";

const serverRoutes = JSON.parse(JSON.stringify(WholesalersRoutes)) as typeof WholesalersRoutes;

serverRoutes.get.func = async function (_ctx) {
	return await execTryCatch(() => executeQuery<Wholesalers>("SELECT * FROM wholesalers"));
};

serverRoutes.post.func = async (ctx) => {
	return await execTryCatch(async (T: Transaction) => {
		const args = Object.values(await ctx.request.json());
		const result = await T.executeQuery(`INSERT INTO wholesalers (name) VALUES (?)`, args);
		await T.executeQuery("INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (?, 0)", [result.insertId]);
		return "Wholesaler added successfully";
	});
};

serverRoutes.delete.func = async (ctx) => {
	return await execTryCatch(async T => {
		const args = await ctx.request.json();
		const wholesaler = (await T.executeQuery<Wholesalers>(`SELECT * FROM wholesalers WHERE id=?`, args))[0] || null;
		if (!wholesaler) throw Error("Wholesaler not found");
		const id = wholesaler.id;
		await T.executeQuery(`UPDATE total_school_payoffs SET amount = amount - (SELECT SUM(amount) FROM school_payoffs WHERE wholesaler_id=?)`, [id]);
		await T.executeQuery("DELETE FROM school_payoffs WHERE wholesaler_id=?", [id]);
		const bookList = await T.executeQuery<Books>("SELECT * FROM books WHERE wholesaler_id=?", [id]);

		await T.executeQuery("DELETE FROM books WHERE wholesaler_id=?", [id]);
		if (bookList.length) {
			await T.executeQuery("UPDATE total_payments SET amount = amount - (SELECT SUM(amount) FROM payments WHERE payment_date IS NULL AND book_id IN (?))", [bookList.map(book => book.id)]);
			await T.executeQuery("DELETE FROM payments WHERE (SELECT count(*) FROM books WHERE books.id=payments.book_id)=0");
		}
		await T.executeQuery(`DELETE FROM wholesalers WHERE id=?`, [id]);
		return "Deleted wholesalers successfully";
	});
};
export const WholesalersServerRoutes = serverRoutes;

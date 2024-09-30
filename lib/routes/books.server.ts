import type { Books, Payments } from "../../types/entities";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { BooksRoutes } from "./books.client";

// Include this in all .server.ts files
const serverRoutes = deepCopy(BooksRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Books>("SELECT * FROM books"));
};

// The getById function should only accept multiple
// ids per select only if there is a need for it in the frontend
serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [book] = await executeQuery<Books>("SELECT * FROM books WHERE id = ?", [id]);
		if (!book) throw Error("Book not found");
		return book;
	});
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const res = await T.executeQuery(
			`INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES (${questionMarks(body)})`,
			body
		);
		// Update school_payoffs table amount
		await Promise.all([
			T.executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				body.wholesale_price * body.quantity,
				body.wholesaler_id
			]),
			T.executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [body.wholesale_price * body.quantity])
		]);
		return res;
	});
};

serverRoutes.updateQuantity.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const reqBook = getUsedBody(ctx) || await ctx.request.json();
		const [book] = await T.executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [reqBook.id]);
		if (book.quantity > reqBook.quantity) throw Error("Cannot reduce quantity");
		const newAddedAmount = book.wholesale_price * (reqBook.quantity - book.quantity);
		await Promise.all([
			T.executeQuery(`UPDATE books SET quantity = ? WHERE id = ?`, reqBook),
			// Update school_payoffs table amount
			T.executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				newAddedAmount,
				book.wholesaler_id
			]),
			T.executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [newAddedAmount])
		]);
		return "Quantity updated successfully";
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const books = await T.executeQuery<Books>(`SELECT * FROM books WHERE id IN (${questionMarks(ids)})`, ids);
		if (books.length === 0) throw Error("Book not found");

		if (ids.length === 1) await T.executeQuery(`DELETE FROM books WHERE id = ?`, ids);
		else await T.executeQuery(`DELETE FROM books WHERE id IN (${questionMarks(ids)})`, ids);

		// Update payments table & total amount
		const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE book_id IN (${questionMarks(ids)}) AND payment_date = 0`, ids);
		let sum = 0;
		for (const payment of payments) {
			sum += (books.find(book => book.id === payment.book_id)?.price || 0) * payment.book_amount;
		}
		await T.executeQuery(`UPDATE total_payments SET amount = amount - ?`, [sum]);
		await T.executeQuery<Payments>(`DELETE FROM payments WHERE book_id IN (${questionMarks(ids)})`, ids);

		return "Book deleted successfully";
	});
};

export const BooksServerRoutes = serverRoutes;

import type { Books, Payments } from "../../types/entities";
import { BooksRoutes } from "./books.client";
import { execTryCatch, executeQuery, questionMarks } from "../utils.server";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(BooksRoutes)) as typeof BooksRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async ({ ctx: _ctx }) => {
	return await execTryCatch(() => executeQuery<Books>("SELECT * FROM books"));
};

serverRoutes.getById.func = async ({ ctx }) => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [book] = await executeQuery<Books>("SELECT * FROM books WHERE id = ?", ids);
		if (!book) throw Error("Book not found");
		return book;
	});
};

serverRoutes.post.func = async ({ ctx }) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		const res = await executeQuery(
			`INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES (${questionMarks(args)})`,
			args
		);

		// Update school_payoffs table amount
		await Promise.all([
			executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				body.wholesale_price * body.quantity,
				body.wholesaler_id
			]),
			executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [body.wholesale_price * body.quantity])
		]);
		return res;
	});
};

serverRoutes.updateQuantity.func = async ({ ctx }) => {
	return await execTryCatch(async () => {
		const reqBook = await ctx.request.json();
		const [book] = await executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [reqBook.id]);
		if (book.quantity > reqBook.quantity) throw Error("Cannot reduce quantity");
		const newAddedAmount = book.wholesale_price * (reqBook.quantity - book.quantity);
		await Promise.all([
			executeQuery(`UPDATE books SET quantity = ? WHERE id = ?`, [reqBook.quantity, reqBook.id]),
			// Update school_payoffs table amount
			executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				newAddedAmount,
				book.wholesaler_id
			]),
			executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [newAddedAmount])
		]);
		return "Quantity updated successfully";
	});
};

serverRoutes.delete.func = async ({ ctx }) => {
	return await execTryCatch(async T => {
		const ids = await ctx.request.json();
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

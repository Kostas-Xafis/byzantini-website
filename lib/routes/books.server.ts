import type { Books } from "../../types/entities";
import { BooksRoutes } from "./books.client";
import { type Transaction, execTryCatch, executeQuery, questionMarks } from "../utils.server";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(BooksRoutes)) as typeof BooksRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Books>("SELECT * FROM books"));
};

serverRoutes.post.func = async (ctx) => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		await executeQuery(
			`INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES (${questionMarks(args.length)})`,
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
		return "Book added successfully";
	});
};

serverRoutes.updateQuantity.func = async (ctx) => {
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

serverRoutes.delete.func = async (ctx) => {
	const body = await ctx.request.json();
	return await execTryCatch(async T => {
		const books = await T.executeQuery<Books>(`SELECT * FROM books WHERE id IN (${questionMarks(body.length)})`, body);
		if (books.length === 0) throw Error("Book not found");

		if (body.length === 1) await T.executeQuery(`DELETE FROM books WHERE id = ?`, body);
		else await T.executeQuery(`DELETE FROM books WHERE id IN (${questionMarks(body.length)})`, body);

		// Update payments table & total amount
		await T.executeQuery(`UPDATE total_payments SET amount = amount - (SELECT SUM(amount) FROM payments WHERE payment_date IS NULL AND book_id IN (${questionMarks(body.length)}))`, body);
		await T.executeQuery("DELETE FROM payments WHERE (SELECT count(*) FROM books WHERE books.id=payments.book_id)=0"); // Delete payments with no book

		return "Book deleted successfully";
	});
};

export const BooksServerRoutes = serverRoutes;

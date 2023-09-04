import type { Books } from "../../types/entities";
import { BooksRoutes } from "./books.client";
import { type Transaction, execTryCatch, executeQuery, questionMarks } from "../utils.server";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(BooksRoutes)) as typeof BooksRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Books>("SELECT * FROM books"));
};

serverRoutes.post.func = async function (req) {
	return await execTryCatch(async () => {
		const body = await req.json();
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

serverRoutes.updateQuantity.func = async function (req) {
	return await execTryCatch(async () => {
		const reqBook = await req.json();
		const [book] = await executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [reqBook.id]);
		if (book.quantity > reqBook.quantity) throw Error("Cannot reduce quantity");
		const newAddedAmount = book.wholesale_price * (reqBook.quantity - book.quantity);
		await Promise.all([
			executeQuery(`UPDATE books SET quantity = ? WHERE id = ?`, [reqBook.quantity, reqBook.id]),
			// Update school_payoffs table amount1
			executeQuery("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				newAddedAmount,
				book.wholesaler_id
			]),
			executeQuery("UPDATE total_school_payoffs SET amount = amount + ?", [newAddedAmount])
		]);
		return "Quantity updated successfully";
	});
};

serverRoutes.delete.func = async function (req) {
	const body = await req.json();
	return await execTryCatch(async () => {
		if (body.length === 1) await executeQuery(`DELETE FROM books WHERE id = ?`, body);
		else await executeQuery(`DELETE FROM books WHERE id IN (${questionMarks(body.length)})`, body);
		return "Book deleted successfully";
	});
};

export const BooksServerRoutes = serverRoutes;

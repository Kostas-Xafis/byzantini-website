import type { Books } from "../../types/entities";
import { BooksRoutes } from "./books.client";
import { Transaction, execTryCatch, executeQuery, questionMarks } from "../utils";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(BooksRoutes)) as typeof BooksRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Books>("SELECT * FROM books"));
};

serverRoutes.post.func = async function (req) {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const args = Object.values(body);
		await T.execute(
			`INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES (${questionMarks(args.length)})`,
			args
		);
		// Update school_payoffs table amount
		await T.execute("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
			body.wholesale_price * body.quantity,
			body.wholesaler_id
		]);
		await T.commit();
		return "Book added successfully";
	});
};

serverRoutes.updateQuantity.func = async function (req) {
	return await execTryCatch(async (T: Transaction) => {
		const reqBook = await req.json();
		const [book] = await T.execute<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [reqBook.id]);
		if (book.quantity > reqBook.quantity) throw Error("Cannot reduce quantity");

		await Promise.all([
			T.execute(`UPDATE books SET quantity = ? WHERE id = ?`, [reqBook.quantity, reqBook.id]),
			// Update school_payoffs table amount1
			T.execute("UPDATE school_payoffs SET amount = amount + ? WHERE wholesaler_id = ?", [
				book.wholesale_price * (reqBook.quantity - book.quantity),
				book.wholesaler_id
			])
		]);
		await T.commit();
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

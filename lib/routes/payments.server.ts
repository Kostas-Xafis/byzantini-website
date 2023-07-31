import type { Books, Payments } from "../../types/entities";
import { execTryCatch, executeQuery, questionMarks, Transaction } from "../utils";
import { PaymentsRoutes } from "./payments.client";

const serverRoutes = JSON.parse(JSON.stringify(PaymentsRoutes)) as typeof PaymentsRoutes;

serverRoutes.get.func = async req => {
	return await execTryCatch(async () => {
		return await executeQuery<Payments>("SELECT * FROM payments ORDER BY date DESC");
	});
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const { book_id, student_name } = await req.json();
		const books = await T.execute<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [book_id]);
		if (books.length === 0) throw Error("Book not found");
		const book = books[0];
		if (book.quantity - book.sold === 0) throw Error("Book is out of stock");

		const [result1, result2] = await Promise.allSettled([
			await T.execute(`INSERT INTO payments (student_name, amount, date) VALUES (${questionMarks(3)})`, [
				student_name,
				book.price,
				Date.now()
			]),
			await T.execute("UPDATE books SET sold = sold + 1 WHERE id = ? AND sold < quantity LIMIT 1", [book_id])
		]);
		if (result1.status === "rejected" || result2.status === "rejected") throw Error("Failed database insertion and/or update");
		// get inserted payment from database
		const [payment] = await T.execute<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [result1.value.insertId]);
		return payment;
	});
};

serverRoutes.updatePayment.func = async req => {
	return await execTryCatch(async () => {
		const { id, amount } = await req.json();
		//check if payment exists
		const payment = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [id]);
		if (payment.length === 0) {
			throw Error("Payment not found");
		}
		await executeQuery("UPDATE payments SET amount = ? WHERE id = ? LIMIT 1", [amount, id]);
		return "Updated payment successfully";
	});
};

serverRoutes.complete.func = async req => {
	return await execTryCatch(async () => {
		const ids = await req.json();
		//check if payment exists
		const payments = await executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids.length)}) `, ids);
		if (payments.length === 0) throw Error("Payment not found");
		await executeQuery(`DELETE FROM payments WHERE id IN (${questionMarks(ids.length)}) `, ids);
		return "Deleted payment successfully";
	});
};

export const PaymentsServerRoutes = serverRoutes;

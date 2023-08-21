import type { Books, Payments } from "../../types/entities";
import { execTryCatch, executeQuery, questionMarks, Transaction } from "../utils";
import { PaymentsRoutes } from "./payments.client";

const serverRoutes = JSON.parse(JSON.stringify(PaymentsRoutes)) as typeof PaymentsRoutes;

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Payments>("SELECT * FROM payments ORDER BY date DESC"));
};

serverRoutes.getTotal.func = async _req => {
	return await execTryCatch(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_payments"))[0]);
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async () => {
		const { book_id, student_name } = await req.json();
		const books = await executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [book_id]);
		if (books.length === 0) throw Error("Book not found");
		const book = books[0];
		if (book.quantity - book.sold === 0) throw Error("Book is out of stock");

		const [result1, result2] = await Promise.allSettled([
			executeQuery(`INSERT INTO payments (book_id, student_name, amount, date) VALUES (${questionMarks(4)})`, [
				book_id,
				student_name,
				book.price,
				Date.now()
			]),
			executeQuery("UPDATE books SET sold = sold + 1 WHERE id = ? AND sold < quantity LIMIT 1", [book_id]),
			executeQuery("UPDATE total_payments SET amount = amount + ?", [book.price]),
		]);
		if (result1.status === "rejected" || result2.status === "rejected") throw Error("Failed database insertion and/or update");
		// get inserted payment from database
		const [payment] = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [result1.value.insertId]);
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
		const previousAmount = (await executeQuery<{ amount: number }>("SELECT amount FROM payments WHERE id = ?", [id]))[0].amount;
		await Promise.all([
			executeQuery("UPDATE payments SET amount = ? WHERE id = ? LIMIT 1", [amount, id]),
			executeQuery("UPDATE total_payments SET amount = amount - ?", [previousAmount - amount])
		]);
		return "Updated payment successfully";
	});
};

serverRoutes.complete.func = async req => {
	return await execTryCatch(async () => {
		const ids = await req.json();
		//check if payment exists
		const payments = await executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids.length)}) `, ids);
		if (payments.length === 0) throw Error("Payment not found");
		let sum = 0;
		for (const payment of payments) {
			sum += payment.amount;
		}
		await Promise.all([
			executeQuery(`UPDATE payments SET payment_date=?, amount=(SELECT price FROM books WHERE books.id=payments.book_id) WHERE id IN (${questionMarks(ids.length)})`, [Date.now(), ...ids]),
			executeQuery("UPDATE total_payments SET amount = amount - ?", [sum])
		]);
		return "Deleted payment successfully";
	});
};

export const PaymentsServerRoutes = serverRoutes;

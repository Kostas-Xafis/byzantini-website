import type { Books, Payments } from "../../types/entities";
import { execTryCatch, executeQuery, questionMarks } from "../utils.server";
import { PaymentsRoutes } from "./payments.client";

const serverRoutes = JSON.parse(JSON.stringify(PaymentsRoutes)) as typeof PaymentsRoutes;

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Payments>("SELECT * FROM payments ORDER BY date DESC"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const payments = await executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)})`, ids);
		if (!payments) throw Error("Payment not found");
		return payments;
	});
};

serverRoutes.getTotal.func = async _ctx => {
	return await execTryCatch(async () => (await executeQuery<{ total: number; }>("SELECT amount AS total FROM total_payments"))[0]);
};

serverRoutes.post.func = async ctx => {
	return await execTryCatch(async () => {
		const { book_id, student_name, book_amount } = await ctx.request.json();
		const book = (await executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [book_id]))[0];
		if (!book) throw Error("Book not found");
		if (book.quantity - book.sold <= 0) throw Error("Book is out of stock");
		if (book_amount > book.quantity - book.sold) throw Error("Not enough books in stock");
		if (book_amount <= 0) throw Error("Invalid book amount");
		const [result1, result2] = await Promise.allSettled([
			executeQuery(`INSERT INTO payments (book_id, student_name, amount, book_amount, date) VALUES (${questionMarks(5)})`, [
				book_id,
				student_name,
				book.price * book_amount,
				book_amount,
				Date.now()
			]),
			executeQuery("UPDATE books SET sold = sold + ? WHERE id = ? LIMIT 1", [book_amount, book_id, book_amount]),
			executeQuery("UPDATE total_payments SET amount = amount + ?", [book.price * book_amount]),
		]);
		if (result1.status === "rejected" || result2.status === "rejected") throw Error("Failed database insertion and/or update");
		// get inserted payment from database
		const [payment] = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [result1.value.insertId]);
		return payment;
	});
};

serverRoutes.updatePayment.func = async ctx => {
	return await execTryCatch(async () => {
		const { id, amount } = await ctx.request.json();
		//check if payment exists
		const payment = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [id]);
		if (payment.length === 0) {
			throw Error("Payment not found");
		}
		await executeQuery("UPDATE payments SET amount = ? WHERE id = ? LIMIT 1", [amount, id]);
		return "Updated payment successfully";
	});
};

serverRoutes.complete.func = async ctx => {
	return await execTryCatch(async (T) => {
		const ids = await ctx.request.json();
		//check if payment exists
		const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date = 0`, ids);
		if (payments.length === 0) throw Error("Payment not found");
		await T.executeQuery(`UPDATE payments SET payment_date=?, amount=(SELECT price FROM books WHERE books.id=payments.book_id)*book_amount WHERE id IN (${questionMarks(ids)})`, [Date.now(), ...ids]);
		await T.executeQuery(`UPDATE total_payments SET amount = amount - (SELECT SUM(amount) FROM payments WHERE id IN (${questionMarks(ids)}))`, [...ids]);
		return "Completed payment successfully";
	});
};

serverRoutes.delete.func = async ctx => {
	return await execTryCatch(async T => {
		const ids = await ctx.request.json();

		//check if payment exists
		const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date != 0`, ids);
		if (payments.length === 0) throw Error("Payments not found");
		let updateBooks = payments.map(payment => T.executeQuery("UPDATE books SET sold = sold - ? WHERE id=? LIMIT 1", [payment.book_amount, payment.book_id]));
		await Promise.all([
			T.executeQuery(`DELETE FROM payments WHERE id IN (${questionMarks(ids)})`, ids),
			...updateBooks
		]);
		return "Deleted payment successfully";
	});
};

export const PaymentsServerRoutes = serverRoutes;

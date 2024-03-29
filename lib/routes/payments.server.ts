import type { Books, Payments } from "../../types/entities";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { PaymentsRoutes } from "./payments.client";

const serverRoutes = deepCopy(PaymentsRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Payments>("SELECT * FROM payments ORDER BY date DESC"));
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		console.log(ids);
		const payments = await executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)})`, ids);
		if (!payments) throw Error("Payment not found");
		return payments;
	});
};

serverRoutes.getTotal.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => (await executeQuery<{ total: number; }>("SELECT amount AS total FROM total_payments"))[0]);
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async (T) => {
		const { book_id, student_name, book_amount } = getUsedBody(ctx) || await ctx.request.json();
		const book = (await T.executeQuery<Books>("SELECT * FROM books WHERE id = ? LIMIT 1", [book_id]))[0];

		if (!book) throw Error("Book not found");
		if (book.quantity - book.sold <= 0) throw Error("Book is out of stock");
		if (book_amount > book.quantity - book.sold) throw Error("Not enough books in stock");
		if (book_amount <= 0) throw Error("Invalid book amount");

		const res = await T.executeQuery(`INSERT INTO payments (book_id, student_name, amount, book_amount, date) VALUES (${questionMarks(5)})`, [
			book_id,
			student_name,
			book.price * book_amount,
			book_amount,
			Date.now()
		]);

		await T.executeQuery("UPDATE books SET sold = sold + ? WHERE id = ?", [book_amount, book_id]);
		await T.executeQuery("UPDATE total_payments SET amount = amount + ?", [book.price * book_amount]);

		return res;
	});
};

serverRoutes.updatePayment.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const { id, amount } = getUsedBody(ctx) || await ctx.request.json();
		//check if payment exists
		const payment = await executeQuery<Payments>("SELECT * FROM payments WHERE id = ? LIMIT 1", [id]);
		if (payment.length === 0) {
			throw Error("Payment not found");
		}
		await executeQuery("UPDATE payments SET amount = ? WHERE id = ?", [amount, id]);
		return "Updated payment successfully";
	});
};

serverRoutes.complete.func = ({ ctx }) => {
	return execTryCatch(async (T) => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		//check if payment exists
		const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date = 0`, ids);
		if (payments.length === 0) throw Error("Payment not found");
		await T.executeQuery(`UPDATE payments SET payment_date = ?, amount=(SELECT price FROM books WHERE books.id=payments.book_id)*book_amount WHERE id IN (${questionMarks(ids)})`, [Date.now(), ...ids]);
		await T.executeQuery(`UPDATE total_payments SET amount = amount - (SELECT SUM(amount) FROM payments WHERE id IN (${questionMarks(ids)}))`, [...ids]);
		return "Completed payment successfully";
	});
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		console.log({ ids });

		//check if payment exists
		const payments = await T.executeQuery<Payments>(`SELECT * FROM payments WHERE id IN (${questionMarks(ids)}) AND payment_date != 0`, ids);
		if (payments.length === 0) throw Error("Payments not found");
		await T.executeQuery(`DELETE FROM payments WHERE id IN (${questionMarks(ids)})`, ids);
		return "Deleted payment successfully";
	});
};

export const PaymentsServerRoutes = serverRoutes;

import type { SchoolPayoffs } from "../../types/entities";
import { execTryCatch, executeQuery, questionMarks } from "../utils.server";
import { PayoffsRoutes, type PayoffGetResponse } from "./payoffs.client";

const serverRoutes = JSON.parse(JSON.stringify(PayoffsRoutes)) as typeof PayoffsRoutes;

serverRoutes.get.func = async _req => {
	return execTryCatch(() => executeQuery<PayoffGetResponse>("SELECT * FROM school_payoffs WHERE amount > 0"));
};

serverRoutes.getTotal.func = async _req => {
	return execTryCatch(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_school_payoffs"))[0]);
};

serverRoutes.updateAmount.func = async req => {
	return execTryCatch(async () => {
		const payoff = await req.json();
		if (payoff.amount < 0) throw Error("Amount must be greater than 0");
		const args = Object.values(payoff);
		const previousAmount = (await executeQuery<{ amount: number }>("SELECT amount FROM school_payoffs WHERE id = ?", [args[0]]))[0].amount;
		if (previousAmount < args[1]) throw Error("Amount must be less than previous amount");
		await Promise.all([
			executeQuery("UPDATE school_payoffs SET amount = ? WHERE id = ? LIMIT 1", [args[1], args[0], args[1]]),
			executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [previousAmount - args[1]])
		]);
		return "Updated payoff amount";
	});
};

serverRoutes.complete.func = async req => {
	return execTryCatch(async () => {
		const ids = await req.json();
		const payoffs = await executeQuery<SchoolPayoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids.length)}) `, ids);
		if (payoffs.length === 0) throw Error("Payoff not found");
		let sum = 0;
		for (const payoff of payoffs) {
			sum += payoff.amount;
		}
		await Promise.all([
			executeQuery(`UPDATE school_payoffs SET amount = 0 WHERE id IN (${questionMarks(ids.length)})`, ids),
			executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [sum])
		]);
		return "Payoffs completed";
	});
};

export const PayoffsServerRoutes = serverRoutes;

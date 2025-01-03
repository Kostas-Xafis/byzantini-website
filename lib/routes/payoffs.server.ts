import type { Payoffs } from "../../types/entities";
import { deepCopy } from "../utils.client";
import { execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { PayoffsRoutes, type PayoffGetResponse } from "./payoffs.client";

const serverRoutes = deepCopy(PayoffsRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<PayoffGetResponse>("SELECT * FROM school_payoffs WHERE amount > 0"), "Σφάλμα κατά την ανάκτηση των πληρωμών");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const payoff = (await executeQuery<Payoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids)})`, ids));
		if (!payoff) throw Error("Payoff not found");
		return payoff;
	});
};

serverRoutes.getTotal.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => (await executeQuery<{ total: number; }>("SELECT amount AS total FROM total_school_payoffs"))[0]);
};

serverRoutes.updateAmount.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const payoff = getUsedBody(ctx) || await ctx.request.json();
		if (payoff.amount < 0) throw Error("Amount must be greater than 0");
		const args = Object.values(payoff);
		const previousAmount = (await T.executeQuery<{ amount: number; }>("SELECT amount FROM school_payoffs WHERE id = ?", [args[0]]))[0].amount;
		if (previousAmount < args[1]) throw Error("Amount must be less than previous amount");
		await Promise.all([
			T.executeQuery("UPDATE school_payoffs SET amount = ? WHERE id = ?", [args[1], args[0]]),
			T.executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [previousAmount - args[1]])
		]);
		return "Updated payoff amount successfully";
	}, "Σφάλμα κατά την ενημέρωση του ποσού της πληρωμής");
};

serverRoutes.complete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const ids = getUsedBody(ctx) || await ctx.request.json();
		const payoffs = await T.executeQuery<Payoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids)}) `, ids);
		if (payoffs.length === 0) throw Error("Payoff not found");
		let sum = 0;
		for (const payoff of payoffs) {
			sum += payoff.amount;
		}
		await Promise.all([
			T.executeQuery(`UPDATE school_payoffs SET amount = 0 WHERE id IN (${questionMarks(ids)})`, ids),
			T.executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [sum])
		]);
		return "Payoffs completed";
	}, "Σφάλμα κατά την ολοκλήρωση των πληρωμών");
};

export const PayoffsServerRoutes = serverRoutes;

import type { SchoolPayoffs } from "../../types/entities";
import { execTryCatch, executeQuery, questionMarks } from "../utils";
import { PayoffsRoutes, PayoffGetResponse } from "./payoffs.client";

const serverRoutes = JSON.parse(JSON.stringify(PayoffsRoutes)) as typeof PayoffsRoutes;

serverRoutes.get.func = async req => {
	return execTryCatch(async () => {
		return await executeQuery<PayoffGetResponse>("SELECT * FROM school_payoffs WHERE amount > 0");
	});
};

serverRoutes.updateAmount.func = async req => {
	return execTryCatch(async () => {
		const payoff = await req.json();
		if (payoff.amount < 0) throw Error("Amount must be greater than 0");
		const args = Object.values(payoff);
		await executeQuery("UPDATE school_payoffs SET amount = ? WHERE id = ? AND amount > ? LIMIT 1", [args[1], args[0], args[1]]);
		return "Updated payoff amount";
	});
};

serverRoutes.complete.func = async req => {
	return execTryCatch(async () => {
		const ids = await req.json();
		const payoffs = await executeQuery<SchoolPayoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids.length)}) `, ids);
		if (payoffs.length === 0) throw Error("Payoff not found");
		await executeQuery(`UPDATE school_payoffs SET amount = 0 WHERE id IN (${questionMarks(ids.length)})`, ids);
		return "Payoffs completed";
	});
};

export const PayoffsServerRoutes = serverRoutes;

import { z } from "astro/zod";
import type { Payoffs, Wholesalers } from "@_types/entities";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_Payoffs } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Payoffs — Phase 4 port of lib/routes/payoffs.client|server.ts.
 * Route keys must match the old client file exactly.
 */

type PayoffGetResponse = Pick<Payoffs, "wholesaler_id" | "amount"> & Pick<Wholesalers, "id">;

/** Body for the "list of ids" routes — the old client typed these as `number[]`. */
const idsReq = z.array(z.number().int());

const updateAmountReq = z_Payoffs.pick({ id: true, amount: true });

export const payoffsRoutes = {
	get: new APIServer({ method: "GET", path: "/payoffs", responseSchema: z.array(z_Payoffs) }, [authenticateMiddleware], () =>
		handlerResult(() => executeQuery<PayoffGetResponse>("SELECT * FROM school_payoffs WHERE amount > 0"), "Σφάλμα κατά την ανάκτηση των πληρωμών"),
	),
	getById: new APIServer({ method: "POST", path: "/payoffs/id", schema: idsReq, responseSchema: z.array(z_Payoffs) }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async () => {
			const ids = body;
			const payoff = await executeQuery<Payoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids)})`, ids);
			if (!payoff) throw Error("Payoff not found");
			return payoff;
		}),
	),
	getTotal: new APIServer({ method: "GET", path: "/payoffs/total", responseSchema: z.object({ total: z.number() }) }, [authenticateMiddleware], () =>
		handlerResult(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_school_payoffs"))[0]),
	),
	updateAmount: new APIServer({ method: "PUT", path: "/payoffs", schema: updateAmountReq }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const payoff = body;
			if (payoff.amount < 0) throw Error("Amount must be greater than 0");
			const args = Object.values(payoff);
			const previousAmount = (await T.executeQuery<{ amount: number }>("SELECT amount FROM school_payoffs WHERE id = ?", [args[0]]))[0].amount;
			if (previousAmount < args[1]) throw Error("Amount must be less than previous amount");
			await Promise.all([
				T.executeQuery("UPDATE school_payoffs SET amount = ? WHERE id = ?", [args[1], args[0]]),
				T.executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [previousAmount - args[1]]),
			]);
			return "Updated payoff amount successfully";
		}, "Σφάλμα κατά την ενημέρωση του ποσού της πληρωμής"),
	),
	complete: new APIServer({ method: "DELETE", path: "/payoffs", schema: idsReq }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const ids = body;
			const payoffs = await T.executeQuery<Payoffs>(`SELECT * FROM school_payoffs WHERE id IN (${questionMarks(ids)}) `, ids);
			if (payoffs.length === 0) throw Error("Payoff not found");
			let sum = 0;
			for (const payoff of payoffs) {
				sum += payoff.amount;
			}
			await Promise.all([
				T.executeQuery(`UPDATE school_payoffs SET amount = 0 WHERE id IN (${questionMarks(ids)})`, ids),
				T.executeQuery("UPDATE total_school_payoffs SET amount = amount - ?", [sum]),
			]);
			return "Payoffs completed";
		}, "Σφάλμα κατά την ολοκλήρωση των πληρωμών"),
	),
};

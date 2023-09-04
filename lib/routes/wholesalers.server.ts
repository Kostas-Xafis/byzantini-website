import type { Wholesalers } from "../../types/entities";
import { type Transaction, execTryCatch, executeQuery, questionMarks } from "../utils.server";
import { WholesalersRoutes } from "./wholesalers.client";

const serverRoutes = JSON.parse(JSON.stringify(WholesalersRoutes)) as typeof WholesalersRoutes;

serverRoutes.get.func = async function (_req) {
	return execTryCatch(async () => {
		const wholesalers = await executeQuery<Wholesalers>("SELECT * FROM wholesalers");
		return wholesalers;
	});
};

serverRoutes.post.func = async function (req) {
	return await execTryCatch(async (T: Transaction) => {
		const args = Object.values(await req.json());
		const result = await T.executeQuery(`INSERT INTO wholesalers (name) VALUES (?)`, args);
		await T.executeQuery("INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (?, 0)", [result.insertId]);
		return "Wholesaler added successfully";
	});
};

serverRoutes.delete.func = async function (req) {
	return await execTryCatch(async () => {
		const args = await req.json();
		await executeQuery(`DELETE FROM wholesalers WHERE id IN (${questionMarks(args.length)})`, args);
		return "Deleted wholesalers successfully";
	});
};
export const WholesalersServerRoutes = serverRoutes;

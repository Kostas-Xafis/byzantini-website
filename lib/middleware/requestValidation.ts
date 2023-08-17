import type { AnyObjectSchema } from "../../types/routes";
import { parse } from "valibot";

export function requestValidation(validation: () => AnyObjectSchema) {
	return async function (req: Request) {
		const body = await req.json();
		// validation is a function because it messes up the type of rendering because I am using the same variable for client and server rendering
		try {
			parse(validation(), req.body);
		} catch (err) {
			return new Response("Invalid request body: " + JSON.stringify(err), { status: 400 });
		}
		req.json = () => Promise.resolve(body);
	};
}

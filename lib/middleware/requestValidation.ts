import type { AnyZodObject } from "zod";

export function requestValidation(validation: () => AnyZodObject) {
	return async function (req: Request) {
		const body = await req.json();
		// validation is a function because it messes up the type of rendering because I am using the same variable for client and server rendering
		const result = validation().safeParse(req.body);
		if (!result.success) return new Response(JSON.stringify(result.error), { status: 400 });
		req.json = () => Promise.resolve(body);
	};
}

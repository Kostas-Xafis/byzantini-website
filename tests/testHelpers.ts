import { expect } from "bun:test";
import { parse, type BaseSchema } from "valibot";
import { Env } from "../lib/env/env";
import { APIEndpoints, type APIArgs, type APIEndpointNames, type APIResponse } from "../lib/routes/index.client";
import { objToFormData } from "../lib/utilities/forms";
import { convertToUrlFromArgs } from "../lib/utilities/url";
import { assertOwnProp } from "../lib/utils.server";

const { VITE_URL = "http://localhost:4321/" } = Env.testEnv;
let session_id = "";
let collectingId = false;
async function setSessionId() {
	while (collectingId) {
		await new Promise((r) => setTimeout(r, 500));
	}
	if (session_id !== "") return;
	collectingId = true;
	const { TEST_EMAIL, TEST_PASSWORD } = Env.env;
	if (TEST_EMAIL == null || TEST_PASSWORD == null) throw new Error("TEST_MAIL and TEST_PASSWORD must be set in the environment");
	const response = await useTestAPI(
		"Authentication.userLogin",
		{
			RequestObject: { email: TEST_EMAIL, password: TEST_PASSWORD },
		},
		false,
	);

	const body = await getJson<APIResponse["Authentication.userLogin"]>(response);
	expect(body).toBeDefined();
	const data = body.data;
	expect(data).toBeDefined();
	expect(data.isValid).toBe(true);
	if (data.isValid) {
		session_id = data.session_id;
	}
	collectingId = false;
}
// testing purposes version — Phase 4 envelope: server returns `{ data }` | `{ message }` | `{ error }`
export const useTestAPI = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], getSessionId = true) => {
	try {
		if (getSessionId) {
			await setSessionId();
		}
		const Route = APIEndpoints[endpoint];
		let fetcher: any = undefined;
		if (req === undefined) {
			const url = VITE_URL + "/api" + Route.path;
			return (fetcher = fetch(url, { method: Route.method, headers: { Cookie: `session_id=${session_id}`, Origin: VITE_URL } }));
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if (Route.validation) {
				const result = Route.validation.safeParse(req.RequestObject);
				if (!result.success) {
					throw new Error(
						(result.error.issues as any[]).map((i: any) => i.message).join("; ") || "Μη έγκυρο αίτημα",
					);
				}
				if (Route.multipart) {
					req.RequestObject = objToFormData(req.RequestObject as any);
				}
			}
			const { RequestObject, UrlArgs } = req;
			const IsBlob = RequestObject instanceof Blob;
			const body = (IsBlob || Route.multipart ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			const headers = {
				Cookie: `session_id=${session_id}`,
				// Astro ≥6 enforces CSRF origin checks on form posts — the test client
				// must send an Origin header like a real browser would.
				Origin: VITE_URL,
			};
			fetcher = fetch(VITE_URL + "/api" + convertToUrlFromArgs(Route.path, UrlArgs), {
				method: Route.method,
				headers: Route.multipart ? headers : { ...headers, "Content-Type": (IsBlob && RequestObject.type) || "application/json" },
				body,
			});
			return fetcher as Promise<Response>;
		}
	} catch (err) {
		console.error(err);
		throw err;
	}
};


/** Phase 4 envelope: `{ data }` | `{ message }` | `{ error }`. */
export function expectBody(body: any, expected?: string | BaseSchema<any, any>, isError = false) {
	if (isError) {
		expect(typeof body.error).toBe("string");
		if (typeof expected === "string") expect(body.error).toBe(expected);
		return;
	}
	if (typeof expected === "string") {
		expect(body.message).toBe(expected);
		return;
	}
	expect(body.data).toBeDefined();
	if (expected) {
		try {
			expect(parse(expected, body.data)).toBeObject();
		} catch (err: any) {
			throw new Error(err);
		}
	}
}

export async function getJson<T>(res: Response): Promise<any> {
	expect(res.status).toBe(200);
	const json = await res.json();
	expect(json).toBeDefined();
	return json;
}

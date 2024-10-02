import { file, hash, write } from "bun";
import { afterAll, test as bun_test, expect } from "bun:test";
import { BaseSchema, parse } from "valibot";
import { APIEndpoints, APIResponse, type APIArgs, type APIEndpointNames } from "../lib/routes/index.client";
import { convertToUrlFromArgs } from "../lib/utils.client";
import { assertOwnProp } from "../lib/utils.server";
import { TypeGuard } from "../types/helpers";
import { DefaultEndpointResponse, EndpointResponse } from "../types/routes";

const { URL, FORCE_TEST } = import.meta.env as { URL: string, FORCE_TEST: string; };
let session_id = "";
let collectingId = false;
async function setSessionId() {
	while (collectingId) {
		await new Promise(r => setTimeout(r, 500));
	}
	if (session_id !== "") return;
	collectingId = true;
	const { TEST_EMAIL, TEST_PASSWORD } = import.meta.env;
	if (TEST_EMAIL == null || TEST_PASSWORD == null) throw new Error("TEST_MAIL and TEST_PASSWORD must be set in the environment");
	const response = (await useTestAPI("Authentication.userLogin", {
		RequestObject: { email: TEST_EMAIL, password: TEST_PASSWORD },
	}, false));

	const res = await getJson<APIResponse["Authentication.userLogin"]>(response);
	expect(res.type).toBe("data");
	expect(res.data).toBeDefined();
	const data = res.data;
	expect(data.isValid).toBe(true);
	if (data.isValid) {
		session_id = data.session_id;
	}
	collectingId = false;
}
// testing purposes version
export const useTestAPI = async <T extends APIEndpointNames>(endpoint: T, req?: APIArgs[T], getSessionId = true) => {
	if (getSessionId) {
		await setSessionId();
	}
	const Route = APIEndpoints[endpoint];
	try {
		let fetcher: any = undefined;
		if (req === undefined) {
			const url = URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method, headers: { "Cookie": `session_id=${session_id}` } });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
			}
			const { RequestObject } = req;
			const body = (RequestObject instanceof Blob ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			fetcher = fetch(URL + "/api" + convertToUrlFromArgs(Route.path, req.UrlArgs), {
				method: Route.method,
				headers: {
					"Content-Type": (RequestObject instanceof Blob && RequestObject.type) || "application/json",
					"Cookie": `session_id=${session_id}`
				},
				body
			});
		}
		return fetcher as Promise<Response>;
	} catch (err) {
		console.error(err);
		throw err;
	}
};

export function expectBody(body: DefaultEndpointResponse["res"], expected: string | BaseSchema<any, any>, isError = false) {
	if (isError) {
		expect(body.type).toBe("error");
		if (body.type === "error")
			expect(body.error).toBe(expected);
		return;
	} else if (typeof expected === "string") {
		expect(body.type).toBe("message");
		if (body.type === "message")
			expect(body.message).toBe(expected);
	} else {
		expect(body.type).toBe("data");
		if (body.type === "data") {
			expect(body.data).toBeDefined();
			try {
				expect(parse(expected, body.data)).toBeObject();
			} catch (err) {
				throw new Error(err);
			}
		}
	}
}

export async function getJson<T>(res: Response): Promise<TypeGuard<T> extends false ? DefaultEndpointResponse<string>["res"] : EndpointResponse<T>["res"]> {
	expect(res.status).toBe(200);
	const json = await res.json();
	expect(json).toBeDefined();
	return json.res;
}

class Signal {
	#res: (value: boolean) => void;
	#rej: (err: unknown) => void;
	#promise: Promise<boolean>;
	constructor() {
		this.#promise = new Promise((res, rej) => {
			this.#res = res;
			this.#rej = rej;
		});
	}
	wait() {
		return this.#promise;
	}
	signal() {
		this.#res(true);
	}
	abort(err: unknown) {
		this.#rej(err);
	}

}

type Function = () => (Promise<unknown> | void);
type TestFunc = [string, Function];
// TODO: If a chain link is updated, the whole chain needs to be re-run
export async function chain(...tests: TestFunc[]) {
	let forceTests = false;
	for (let i = 0; i < tests.length; i++) {
		const [testLabel, testFunc] = tests[i];
		if (checkCache(testLabel, functionHash(testFunc))) {
			forceTests = true;
			break;
		}
	}
	let sigTests = tests.map((test) => [...test, new Signal()]) as [string, Function, Signal][];
	for (let i = 0; i < sigTests.length; i++) {
		const [testLabel, testFunc, signal] = sigTests[i];
		const nextSignal = i + 1 < sigTests.length ? sigTests[i + 1][2] : null;
		const wrapper = async () => {
			try {
				await signal.wait();
				testFunc.constructor.name === "AsyncFunction" ? await testFunc() : testFunc();
			} catch (error) {
				sigTests.forEach(([, , s], j) => {
					if (j > i) {
						s.abort(error);
					}
				});
				throw error;
			}
			nextSignal && nextSignal.signal();
		};

		// Initialize the tests in the chain
		cached_test(testLabel, testFunc, { wrapper, force: forceTests });
	}
	// Start the chain
	sigTests[0][2].signal();
}

let cached_test_file = file("./.cache/tests.json");
const cached_tests = (await cached_test_file.exists() && FORCE_TEST !== "true" ? await cached_test_file.json() : {}) as { [key: string]: string; };

const functionHash = (func: Function) => hash(func.toString()).toString(16);

const checkCache = (label: string, hash: string) => {
	return !cached_tests[label] || cached_tests[label] !== hash;
};

const cached_test = (label: string, func: Function, { wrapper, force = false }: { wrapper?: () => Promise<void>; force?: boolean; } = {}) => {
	const testHash = functionHash(func);
	if (FORCE_TEST === "true" || checkCache(label, testHash) || force === true) {
		bun_test(label, async () => {
			if (wrapper) {
				await wrapper();
			} else if (func.constructor.name === "AsyncFunction") {
				await func();
			} else {
				func();
			}
			cached_tests[label] = testHash;
		});
	} else {
		bun_test.skip(label, wrapper || func);
	}
};

afterAll(() => {
	write("./.cache/tests.json", JSON.stringify(cached_tests, null, 2));
});

export { cached_test as test };

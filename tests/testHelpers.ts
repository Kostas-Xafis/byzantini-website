import { file, hash, write } from "bun";
import { test as bun_test, expect } from "bun:test";
import { BaseSchema, parse } from "valibot";
import { APIEndpoints, APIResponse, type APIArgs, type APIEndpointNames } from "../lib/routes/index.client";
import { APIRaw } from "../lib/routes/index.server";
import { convertToUrlFromArgs, isAsyncFunction, objToFormData } from "../lib/utils.client";
import { assertOwnProp } from "../lib/utils.server";
import { TypeGuard } from "../types/helpers";
import { DefaultEndpointResponse, EndpointResponse } from "../types/routes";

const { VITE_URL = "", FORCE_TEST = false } = import.meta.env;
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
			const url = VITE_URL + "/api" + Route.path;
			fetcher = fetch(url, { method: Route.method, headers: { "Cookie": `session_id=${session_id}` } });
		} else {
			assertOwnProp(req, "RequestObject");
			assertOwnProp(req, "UrlArgs");
			if ("validation" in Route && Route.validation) {
				parse(Route.validation, req.RequestObject);
				if (Route.multipart) {
					req.RequestObject = objToFormData(req.RequestObject as any);
				}
			}
			const { RequestObject, UrlArgs } = req;
			const IsBlob = RequestObject instanceof Blob;
			const body = ((IsBlob || Route.multipart) ? RequestObject : (RequestObject && JSON.stringify(RequestObject)) || null) as any;
			const headers = {
				"Cookie": `session_id=${session_id}`
			};
			fetcher = fetch(VITE_URL + "/api" + convertToUrlFromArgs(Route.path, UrlArgs), {
				method: Route.method,
				headers: Route.multipart ? headers : { ...headers, "Content-Type": (IsBlob && RequestObject.type) || "application/json" },
				body,
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

type TestOpts = {
	timeout?: number;
	retry?: number;
	repeats?: number;
};

const skip = (label: string, func: Function) => bun_test.skip(label, func);
const test = (label: string, func: Function, opts: TestOpts = {}) => bun_test(label, func, opts);

type Function = () => (Promise<unknown> | void);
type TestFunc = [string, Function] | [string, Function, TestOpts | undefined];
type TestChainLink = {
	label: string;
	func: Function;
	wrapper: Function;
	opts: TestOpts;
	signal: Signal;
};
export async function chain(...tests: TestFunc[]) {
	let forceTests = false;
	// Check if any of the tests have been cached else force all tests to run in the chain
	for (let i = 0; i < tests.length; i++) {
		const [testLabel, testFunc] = tests[i];
		const apiCalls = apiCallsHash(testFunc).map(item => checkCache(...item));
		if (checkCache(testLabel, functionHash(testFunc)) || apiCalls.includes(true)) {
			forceTests = true;
			break;
		}
	}

	let sigTests: TestChainLink[] = tests.map((test) => {
		return { label: test[0], func: test[1], opts: test.at(2) || {}, signal: new Signal() } as any;
	});
	for (let i = 0; i < sigTests.length; i++) {
		const { label, func, signal } = sigTests[i];
		const nextSignal = i + 1 < sigTests.length ? sigTests[i + 1].signal : null;
		const wrapper = async () => {
			try {
				await signal.wait();
				isAsyncFunction(func) ? await func() : func();

				// Generate and store the new hash
				cached_tests[label] = functionHash(func);
				apiCallsHash(func).forEach(([key, hash], i) => {
					cached_tests[key] = hash;
				});

				// Signal the next test in the chain
				nextSignal && nextSignal.signal();
			} catch (error) {
				sigTests.forEach(({ signal: s }, j) => {
					if (j > i) {
						s.abort("Test chain aborted");
					}
				});
				throw error;
			} finally {
				if (i === sigTests.length - 1) {
					write("./.cache/tests.json", JSON.stringify(cached_tests, null, 2));
				}
			}
		};
		sigTests[i].wrapper = wrapper;

		// Initialize the tests in the chain
		chain_cached_test(sigTests[i], { force: forceTests });
	}
	// Start the chain
	sigTests[0].signal.signal();
}

const cached_test_file = file("./.cache/tests.json");
const cached_tests = (await cached_test_file.exists() && FORCE_TEST !== "true" ? await cached_test_file.json() : {}) as { [key: string]: string; };

const functionHash = (func: Function) => hash(func.toString()).toString(16);
// Find all API calls inside a test function and return their hash
const apiCallsHash = (func: Function): [string, string][] =>
	[...func.toString().matchAll(/(useTestAPI\(\")[\w+.]+/g)]
		.join("").replaceAll("useTestAPI(\"", "")
		.split(",").filter(Boolean).map(EndpointName => [EndpointName, functionHash(APIRaw[EndpointName].func)]) as any;
const checkCache = (key: string, hash: string) => {
	return !cached_tests[key] || cached_tests[key] !== hash;
};

const cached_test = (label: string, func: Function, { force = false }: { force?: boolean; } = {}) => {
	const testHash = functionHash(func);
	const apiCallHashes = apiCallsHash(func);
	const apiCalls = apiCallHashes.map(item => checkCache(...item));
	if (FORCE_TEST === "true" || checkCache(label, testHash) || apiCalls.includes(true) || force === true) {
		test(label, async () => {
			isAsyncFunction(func) ? await func() : func();
			cached_tests[label] = testHash;
			apiCallHashes.forEach(([key, hash], i) => {
				cached_tests[key] = hash;
			});
			write("./.cache/tests.json", JSON.stringify(cached_tests, null, 2));
		});
	} else {
		skip(label, func);
	}
};

type ChainOpts = {
	force?: boolean;
};
const defaultTestOpts: TestOpts = {
	timeout: 10000,
	retry: 0,
	repeats: 0,
};
const chain_cached_test = (link: TestChainLink, chainOpts?: ChainOpts) => {
	const { force = false } = chainOpts || {};
	const { label, func, wrapper, opts } = link;
	const testHash = functionHash(func);
	if (FORCE_TEST === "true" || checkCache(label, testHash) || force === true) {
		test(label, wrapper, { ...defaultTestOpts, ...opts });
	} else {
		skip(label, func);
	}
};

export { cached_test as test };

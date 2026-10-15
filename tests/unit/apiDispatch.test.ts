/**
 * Unit tests for the API dispatch layer (lib/api/routes/APIServer.ts,
 * APIRoute.ts, APIError.ts): routing, path-param decoding/coercion, the error
 * envelope and the middleware/validation order.
 *
 * Runs `APIServer.handle` in-process against a few throwaway routes under
 * `/__unit` (the real route groups are never imported), so it needs no dev
 * server, no DB and no env file.
 */
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { z } from "astro/zod";
import { z_IdArray } from "@lib/api/schemas";
import { APIError } from "@lib/api/routes/APIError";
import {
	APIServer,
	handlerResult,
	HTTP,
	INVALID_BODY_MESSAGE,
	METHOD_NOT_ALLOWED_MESSAGE,
	ROUTE_NOT_FOUND_MESSAGE,
	SERVER_ERROR_MESSAGE,
	type MiddlewareFunction,
} from "@lib/api/routes/APIServer";

const denyAll: MiddlewareFunction = () => APIServer.jsonError("Unauthorized", HTTP.UNAUTHORIZED);

new APIServer({ method: "GET", path: "/__unit/items/[id:number]" }, ({ params }) => APIServer.jsonData({ id: params.id }));
new APIServer({ method: "GET", path: "/__unit/items/static" }, () => APIServer.jsonData("static"));
new APIServer({ method: "DELETE", path: "/__unit/items/[id:number]" }, () => APIServer.jsonMessage("deleted"));
new APIServer({ method: "GET", path: "/__unit/names/[name:string]" }, ({ params }) => APIServer.jsonData({ name: params.name }));
new APIServer({ method: "POST", path: "/__unit/ids", schema: z_IdArray }, ({ body }) => APIServer.jsonData({ first: body[0] }));
new APIServer({ method: "POST", path: "/__unit/guarded", schema: z_IdArray }, [denyAll], () => APIServer.jsonMessage("unreachable"));
new APIServer({ method: "GET", path: "/__unit/fail/api-error" }, () =>
	handlerResult(async () => {
		throw APIError.conflict("Δεν υπάρχουν αρκετά βιβλία");
	}, "Σφάλμα κατά τη δοκιμή"),
);
new APIServer({ method: "GET", path: "/__unit/fail/db" }, () =>
	handlerResult(async () => {
		throw new Error("D1_ERROR: no such table: secret_table: SQLITE_ERROR");
	}, "Σφάλμα κατά τη δοκιμή"),
);
new APIServer({ method: "GET", path: "/__unit/fail/db-no-message" }, () =>
	handlerResult(async () => {
		throw new Error("D1_ERROR: constraint failed");
	}),
);
new APIServer({ method: "GET", path: "/__unit/fail/naked" }, () => {
	throw new Error("D1_ERROR: thrown outside handlerResult");
});
new APIServer({ method: "GET", path: "/__unit/fail/zod" }, () => handlerResult(async () => z.object({ id: z.number("Μη έγκυρο id") }).parse({ id: "x" })));
new APIServer({ method: "GET", path: "/__unit/fail/response", responseSchema: z.object({ id: z.number() }) }, () => APIServer.jsonData({ id: "not a number" }));

const call = (method: string, path: string, body?: unknown) =>
	APIServer.handle(
		new Request(`http://unit.test/api${path}`, {
			method,
			headers: body === undefined ? {} : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		"/api",
	);

let consoleError: ReturnType<typeof spyOn>;
// Another test file may load the registry, which installs the «Σφάλματα» recorder (a DB write): swap in a spy.
let failures: { endpoint?: string; status: number; error: unknown }[] = [];
const installedOnServerError = APIServer.onServerError;
beforeEach(() => {
	consoleError = spyOn(console, "error").mockImplementation(() => {});
	failures = [];
	APIServer.onServerError = async ({ route, status, error }) => void failures.push({ endpoint: route.path, status, error });
});
afterEach(() => {
	consoleError.mockRestore();
	APIServer.onServerError = installedOnServerError;
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
test("an unknown path is a JSON 404, not a redirect", async () => {
	const res = await call("GET", "/__unit/nothing-here");
	expect(res.status).toBe(404);
	expect(res.headers.get("Content-Type")).toContain("application/json");
	expect(await res.json()).toEqual({ error: ROUTE_NOT_FOUND_MESSAGE });
});

test("a known path under another method is a 405 with Allow", async () => {
	const res = await call("POST", "/__unit/items/5");
	expect(res.status).toBe(405);
	expect(res.headers.get("Allow")).toBe("GET, DELETE");
	expect(await res.json()).toEqual({ error: METHOD_NOT_ALLOWED_MESSAGE });
});

test("a static route wins over a parametrised one", async () => {
	expect(await (await call("GET", "/__unit/items/static")).json()).toEqual({ data: "static" });
});

// ---------------------------------------------------------------------------
// Path params
// ---------------------------------------------------------------------------
test("[id:number] reaches the handler as a number", async () => {
	expect(await (await call("GET", "/__unit/items/42")).json()).toEqual({ data: { id: 42 } });
	expect(await (await call("GET", "/__unit/items/-1.5")).json()).toEqual({ data: { id: -1.5 } });
});

test("a [id:number] segment that is not a decimal number does not match (404)", async () => {
	for (const segment of ["abc", "12abc", "1e3", "0x10", "Infinity", "%20"]) {
		const res = await call("GET", `/__unit/items/${segment}`);
		expect(res.status, segment).toBe(404);
	}
});

test("string params are percent-decoded exactly once", async () => {
	const name = "Ανακοίνωση 50% / 2026";
	const res = await call("GET", `/__unit/names/${encodeURIComponent(name)}`);
	expect(await res.json()).toEqual({ data: { name } });
	// fillParams is the matching encoder
	expect(APIServer.fillParams("/__unit/names/[name:string]", { name })).toBe(`/__unit/names/${encodeURIComponent(name)}`);
	// a literal "%25" in the value survives (no double decode)
	expect(await (await call("GET", `/__unit/names/${encodeURIComponent("a%25b")}`)).json()).toEqual({ data: { name: "a%25b" } });
});

test("a malformed escape is kept as written", async () => {
	expect(await (await call("GET", "/__unit/names/50%")).json()).toEqual({ data: { name: "50%" } });
});

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
test("z_IdArray rejects an empty list with a 400", async () => {
	const res = await call("POST", "/__unit/ids", []);
	expect(res.status).toBe(400);
	const json = await res.json();
	expect(json.error).toBe(INVALID_BODY_MESSAGE);
	expect(JSON.stringify(json.details)).toContain("Δεν επιλέχθηκε καμία εγγραφή");
	expect(await (await call("POST", "/__unit/ids", [7, 8])).json()).toEqual({ data: { first: 7 } });
});

test("a body that is not JSON is a 400", async () => {
	const res = await APIServer.handle(new Request("http://unit.test/api/__unit/ids", { method: "POST", body: "[1," }), "/api");
	expect(res.status).toBe(400);
	expect(await res.json()).toEqual({ error: INVALID_BODY_MESSAGE });
});

test("middleware runs before validation: an anonymous caller gets 401, not a validation report", async () => {
	const res = await call("POST", "/__unit/guarded", []);
	expect(res.status).toBe(401);
});

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------
test("an APIError keeps its status and public message", async () => {
	const res = await call("GET", "/__unit/fail/api-error");
	expect(res.status).toBe(409);
	expect(await res.json()).toEqual({ error: "Δεν υπάρχουν αρκετά βιβλία" });
	expect(consoleError).not.toHaveBeenCalled();
});

test("an unexpected error is logged and answered with the route's message, never the raw text", async () => {
	const res = await call("GET", "/__unit/fail/db");
	expect(res.status).toBe(500);
	const text = await res.text();
	expect(JSON.parse(text)).toEqual({ error: "Σφάλμα κατά τη δοκιμή" });
	expect(text).not.toContain("D1_ERROR");
	expect(consoleError).toHaveBeenCalledTimes(1);
	expect(String(consoleError.mock.calls[0][1])).toContain("secret_table");
});

test("without a route message the generic one is used", async () => {
	const res = await call("GET", "/__unit/fail/db-no-message");
	expect(res.status).toBe(500);
	expect(await res.json()).toEqual({ error: SERVER_ERROR_MESSAGE });
});

test("a handler that throws outside handlerResult is still a JSON 500", async () => {
	const res = await call("GET", "/__unit/fail/naked");
	expect(res.status).toBe(500);
	expect(await res.json()).toEqual({ error: SERVER_ERROR_MESSAGE });
	expect(String(consoleError.mock.calls[0][0])).toContain("GET /__unit/fail/naked");
});

test("a Zod error thrown by a handler is a 400 with details", async () => {
	const res = await call("GET", "/__unit/fail/zod");
	expect(res.status).toBe(400);
	const json = await res.json();
	expect(json.error).toBe(INVALID_BODY_MESSAGE);
	expect(JSON.stringify(json.details)).toContain("Μη έγκυρο id");
});

test("a response that breaks its schema is logged and answered with the generic 500", async () => {
	const res = await call("GET", "/__unit/fail/response");
	expect(res.status).toBe(500);
	expect(await res.json()).toEqual({ error: SERVER_ERROR_MESSAGE });
	expect(consoleError).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// «Σφάλματα»: every unexpected 500 reaches onServerError with its real error
// ---------------------------------------------------------------------------
test("onServerError gets the error behind each kind of 500, and nothing for 4xx", async () => {
	await call("GET", "/__unit/fail/db");
	await call("GET", "/__unit/fail/naked");
	await call("GET", "/__unit/fail/response");
	await call("GET", "/__unit/fail/api-error");
	await call("GET", "/__unit/fail/zod");
	await call("GET", "/__unit/nope");
	expect(failures.map((f) => [f.endpoint, f.status, (f.error as Error).message])).toEqual([
		["/__unit/fail/db", 500, "D1_ERROR: no such table: secret_table: SQLITE_ERROR"],
		["/__unit/fail/naked", 500, "D1_ERROR: thrown outside handlerResult"],
		["/__unit/fail/response", 500, "The response does not match its schema"],
	]);
});

test("a failing onServerError never changes the answer", async () => {
	APIServer.onServerError = async () => {
		throw new Error("recorder down");
	};
	const res = await call("GET", "/__unit/fail/db");
	expect(res.status).toBe(500);
	expect(await res.json()).toEqual({ error: "Σφάλμα κατά τη δοκιμή" });
});

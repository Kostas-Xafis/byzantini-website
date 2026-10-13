/**
 * The shared request/response codec behind `apiCall` (browser) and `useAPI` (server, in-process):
 * request building and the `{ data } | { message } | { error, details? }` envelope, including the
 * error shapes the registration form relies on (B9: 404 vs server failure vs no connection, and the
 * server's per-field validation messages). Pure — no dev server needed.
 */
import { describe, expect, test } from "bun:test";
import { APIRequestError, buildAPIRequest, readAPIResponse, validationMessages } from "@lib/api/transport";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("readAPIResponse", () => {
	test("resolves the data and message envelopes", async () => {
		expect(await readAPIResponse(json({ data: [1, 2] }))).toEqual({ data: [1, 2] });
		expect(await readAPIResponse(json({ message: "Επιτυχία" }))).toEqual({ message: "Επιτυχία" });
	});

	test("an error envelope throws APIRequestError with the status and the server's message", async () => {
		const err = await readAPIResponse(json({ error: "Δεν βρέθηκε μαθητής" }, 404)).catch((e) => e);
		expect(err).toBeInstanceOf(APIRequestError);
		expect(err.status).toBe(404);
		expect(err.message).toBe("Δεν βρέθηκε μαθητής");
		expect(err.envelope).toBe(true);
		expect(err.details).toBeUndefined();
	});

	test("a 400 carries the validation tree as details", async () => {
		const details = { errors: [], properties: { email: { errors: ["Μη έγκυρο email"] } } };
		const err = await readAPIResponse(json({ error: "Invalid request body", details }, 400)).catch((e) => e);
		expect(err.status).toBe(400);
		expect(err.details).toEqual(details);
	});

	test("a non-JSON response (platform error page) is an APIRequestError that is not an envelope", async () => {
		const err = await readAPIResponse(new Response("<html>Bad gateway</html>", { status: 502 })).catch((e) => e);
		expect(err).toBeInstanceOf(APIRequestError);
		expect(err.status).toBe(502);
		expect(err.envelope).toBe(false);
	});

	test("a non-2xx JSON body without an error key still throws", async () => {
		const err = await readAPIResponse(json({ data: 1 }, 500)).catch((e) => e);
		expect(err).toBeInstanceOf(APIRequestError);
		expect(err.status).toBe(500);
	});
});

test("validationMessages flattens a treeifyError tree, de-duplicated", () => {
	expect(
		validationMessages({
			errors: ["Μη έγκυρο αίτημα"],
			properties: {
				email: { errors: ["Μη έγκυρο email"] },
				tk: { errors: ["Μη έγκυρος ταχυδρομικός κώδικας", "Μη έγκυρο email"] },
				nested: { errors: [], items: [undefined, { errors: ["Μη έγκυρο id"] }] },
			},
		}),
	).toEqual(["Μη έγκυρο αίτημα", "Μη έγκυρο email", "Μη έγκυρος ταχυδρομικός κώδικας", "Μη έγκυρο id"]);
	expect(validationMessages(undefined)).toEqual([]);
});

describe("buildAPIRequest", () => {
	const route = { method: "POST", path: "/teachers/[id:number]", multipart: false };

	test("no request: a bare call, no headers and no body", () => {
		expect(buildAPIRequest({ method: "GET", path: "/books", multipart: false })).toEqual({ path: "/books", init: { method: "GET" } });
	});

	test("JSON body + URL params; the caller's object is left alone", () => {
		const req = { RequestObject: { name: "x" }, UrlArgs: { id: 7 } };
		const { path, init } = buildAPIRequest(route, req);
		expect(path).toBe("/teachers/7");
		expect(init.body).toBe('{"name":"x"}');
		expect(init.headers).toEqual({ "Content-Type": "application/json" });
		expect(req.RequestObject).toEqual({ name: "x" });
	});

	test("multipart bodies become FormData with type markers", () => {
		const { init } = buildAPIRequest({ ...route, path: "/announcements/images", multipart: true }, { RequestObject: { announcement_id: 3 } });
		expect(init.body).toBeInstanceOf(FormData);
		expect((init.body as FormData).getAll("announcement_id")).toEqual(["number", "3"]);
		expect(init.headers).toEqual({});
	});

	test("raw Blob uploads (rawBlob routes) keep their own content type", () => {
		const blob = new Blob(["%PDF"], { type: "application/pdf" });
		const { init } = buildAPIRequest({ ...route, method: "PUT" }, { RequestObject: blob, UrlArgs: { id: 1 } });
		expect(init.body).toBe(blob);
		expect(init.headers).toEqual({ "Content-Type": "application/pdf" });
	});
});

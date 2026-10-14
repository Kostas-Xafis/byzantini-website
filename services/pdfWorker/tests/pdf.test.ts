import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { join } from "node:path";
import worker, { type Env } from "../src/index";
import type { PDFRequest } from "../src/types";
import { registrationCases, TEMPLATES } from "./fixtures/registrations";
import { ASSETS_DIR, expectFilledPdf, readGolden, saveOutput, sha256, UPDATE_GOLDEN, writeGolden } from "./golden";

/**
 * PDF worker suite — calls the worker's fetch handler in-process (no wrangler, no network) with an
 * ASSETS binding backed by ./assets, and compares every generated PDF against its golden SHA-256
 * (tests/fixtures/golden.json). Regenerate after an intended change: `UPDATE_GOLDEN=1 bun run test`.
 */
const TOKEN = "pdf-worker-test-token";

const env: Env = {
	SERVICE_AUTH_TOKEN: TOKEN,
	ASSETS: {
		fetch: async (input: RequestInfo | URL) => {
			const file = Bun.file(join(ASSETS_DIR, new URL(input instanceof Request ? input.url : input).pathname));
			return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
		},
		connect: () => {
			throw new Error("not implemented");
		},
	} as unknown as Fetcher,
};

function callWorker(body: unknown, { token = TOKEN, method = "POST" }: { token?: string | null; method?: string } = {}) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token !== null) headers.Authorization = `Bearer ${token}`;
	const request = new Request("https://pdf-service.internal/", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
	return worker.fetch(request as Parameters<typeof worker.fetch>[0], env);
}

const single = (name: keyof typeof registrationCases): PDFRequest => ({ type: "registration", request: { isMultiple: false, data: registrationCases[name] } });
const multiple = (names: (keyof typeof registrationCases)[]): PDFRequest => ({
	type: "registration",
	request: { isMultiple: true, data: names.map((n) => registrationCases[n]) },
});

const golden = await readGolden();
const computed: Record<string, string> = {};

/** Generates, checks the shape, then compares (or, with UPDATE_GOLDEN=1, records) the hash. */
async function expectGolden(key: string, body: PDFRequest, pages = 1): Promise<string> {
	const response = await callWorker(body);
	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Type")).toBe("application/pdf");
	expect(response.headers.get("X-Request-Id")).toBeTruthy();
	const bytes = await response.arrayBuffer();
	await expectFilledPdf(bytes, { pages });

	const hash = sha256(bytes);
	computed[key] = hash;
	if (UPDATE_GOLDEN) await saveOutput(key, bytes);
	else expect(hash, `golden hash of "${key}" (UPDATE_GOLDEN=1 regenerates)`).toBe(golden[key]);
	return hash;
}

afterAll(async () => {
	if (UPDATE_GOLDEN) await writeGolden(computed);
	setSystemTime();
});

describe("pdf worker — request handling", () => {
	test("rejects anything but POST", async () => {
		const response = await callWorker(undefined, { method: "GET" });
		expect(response.status).toBe(400);
	});

	test("rejects a missing or wrong bearer token", async () => {
		expect((await callWorker(single("byzantine"), { token: null })).status).toBe(401);
		expect((await callWorker(single("byzantine"), { token: "wrong-token" })).status).toBe(401);
	});

	test("rejects every call when the worker has no token configured", async () => {
		const request = new Request("https://pdf-service.internal/", { method: "POST", headers: { Authorization: "Bearer " }, body: "{}" });
		const response = await worker.fetch(request as Parameters<typeof worker.fetch>[0], { ...env, SERVICE_AUTH_TOKEN: undefined });
		expect(response.status).toBe(401);
	});

	test("rejects a malformed body or an unknown request type", async () => {
		const malformed = new Request("https://pdf-service.internal/", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: "{not json" });
		expect((await worker.fetch(malformed as Parameters<typeof worker.fetch>[0], env)).status).toBe(400);
		expect((await callWorker({ type: "invoice", request: {} })).status).toBe(400);
	});

	test("answers 400 (not a broken PDF) for a template that does not exist", async () => {
		const body: PDFRequest = {
			type: "registration",
			request: { isMultiple: false, data: { ...registrationCases.byzantine, url: "/pdf_templates/missing.pdf" } },
		};
		const response = await callWorker(body);
		expect(response.status).toBe(400);
		expect(response.headers.get("Content-Type")).not.toBe("application/pdf");
	});
});

describe("pdf worker — golden PDFs", () => {
	for (const name of Object.keys(registrationCases) as (keyof typeof registrationCases)[]) {
		test(`single: ${name}`, async () => {
			await expectGolden(`single.${name}`, single(name));
		});
	}

	test("multiple: every fixture merged in order", async () => {
		const names = Object.keys(registrationCases) as (keyof typeof registrationCases)[];
		await expectGolden("multiple.all", multiple(names), names.length);
	});

	test("each template and each student gives a different PDF (the fields are really drawn)", async () => {
		const hashes = Object.keys(registrationCases).map((name) => computed[`single.${name}`]);
		expect(hashes.every(Boolean)).toBe(true);
		expect(new Set(hashes).size).toBe(hashes.length);
		for (const template of TEMPLATES) {
			expect(hashes).not.toContain(sha256(await Bun.file(join(ASSETS_DIR, template)).arrayBuffer()));
		}
	});

	test("the output does not depend on the clock (same bytes in another year)", async () => {
		const before = sha256(await (await callWorker(single("byzantine"))).arrayBuffer());
		setSystemTime(new Date("2031-03-03T03:03:03Z"));
		try {
			const after = sha256(await (await callWorker(single("byzantine"))).arrayBuffer());
			expect(after).toBe(before);
		} finally {
			setSystemTime();
		}
	});
});

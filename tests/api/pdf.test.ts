/**
 * PDF generation end to end: browser → `POST /api/pdf` (session cookie) → `PDF_SERVICE` binding → the PDF
 * worker → back through the site's proxy. Every PDF must match the golden SHA-256 of the worker suite
 * (services/pdfWorker/tests/fixtures/golden.json — same dummy fixtures), so a blank, empty, truncated or
 * otherwise different PDF fails here, not in the secretaries' downloads.
 *
 * Requires: `bun run dev` on :4321, `tests/.env.test`, and the PDF worker running locally
 * (`cd services/pdfWorker && bunx wrangler dev --config wrangler.jsonc`) — started BEFORE the dev server,
 * which only discovers the worker's dev session at startup.
 */
import type { PDFRequest } from "../../services/pdfWorker/src/types";
import { registrationCases } from "../../services/pdfWorker/tests/fixtures/registrations";
import { expectFilledPdf, readGolden, sha256 } from "../../services/pdfWorker/tests/golden";
import { describe, expect, test } from "bun:test";
import { rawAPI } from "../rawAPI.ts";
import { useTestAPI } from "../testHelpers.ts";

type CaseName = keyof typeof registrationCases;

const golden = await readGolden();
const names = Object.keys(registrationCases) as CaseName[];

const single = (name: CaseName): PDFRequest => ({ type: "registration", request: { isMultiple: false, data: registrationCases[name] } });

const generate = (body: PDFRequest) => useTestAPI("PDF.generate", { RequestObject: body, UrlArgs: {} } as never);

async function expectGoldenPdf(response: Response, key: string, pages = 1) {
	const contentType = response.headers.get("Content-Type") ?? "";
	if (response.status !== 200 || !contentType.startsWith("application/pdf")) {
		throw new Error(`/api/pdf answered ${response.status} ${contentType}: ${(await response.text()).slice(0, 300)} — is the PDF worker running locally?`);
	}
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	const bytes = await response.arrayBuffer();
	await expectFilledPdf(bytes, { pages });
	expect(golden[key], `golden hash for "${key}" (run the pdfWorker suite with UPDATE_GOLDEN=1)`).toBeDefined();
	expect(sha256(bytes), `SHA-256 of "${key}"`).toBe(golden[key]);
}

describe("--pdf-- POST /api/pdf", () => {
	test("--pdf-- #1 anonymous callers get 401, not a PDF", async () => {
		const response = await rawAPI("POST", "/pdf", single("byzantine"));
		expect(response.status).toBe(401);
		expect(response.headers.get("Content-Type")).not.toStartWith("application/pdf");
	});

	test("--pdf-- #2 a body that is not a registration request is rejected with 400", async () => {
		const response = await useTestAPI("PDF.generate", { RequestObject: { type: "registration", request: {} }, UrlArgs: {} } as never);
		// The site only checks the envelope; the worker rejects the empty request → the proxy answers 502.
		expect([400, 502]).toContain(response.status);
		expect(response.headers.get("Content-Type")).not.toStartWith("application/pdf");
	});

	for (const name of names) {
		test(`--pdf-- #3 single PDF matches its golden hash: ${name}`, async () => {
			await expectGoldenPdf(await generate(single(name)), `single.${name}`);
		});
	}

	test("--pdf-- #4 a merged (bulk print) PDF matches its golden hash", async () => {
		const body: PDFRequest = { type: "registration", request: { isMultiple: true, data: names.map((n) => registrationCases[n]) } };
		await expectGoldenPdf(await generate(body), "multiple.all", names.length);
	});

	test("--pdf-- #5 a worker failure reaches the browser as a JSON error, never as a blank PDF", async () => {
		const body: PDFRequest = {
			type: "registration",
			request: { isMultiple: false, data: { ...registrationCases.byzantine, url: "/pdf_templates/missing.pdf" } },
		};
		const response = await generate(body);
		expect(response.status).toBe(502);
		expect(response.headers.get("Content-Type")).toStartWith("application/json");
		expect(typeof (await response.json()).error).toBe("string");
	});
});

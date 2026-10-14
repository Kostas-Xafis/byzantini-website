/**
 * The API's error contract against the real route registry on the dev server:
 * JSON 404/405 envelopes, path-param decoding/coercion, empty id lists, and
 * the status codes of expected (APIError) failures. Raw requests go through
 * `rawAPI` (anonymous, sent as written); authenticated ones through the
 * harness. No test here writes to the database.
 *
 * Requires: the dev server (`VITE_URL` in tests/.env.test).
 */
import { Random as R } from "@lib/random";
import { expect, test } from "bun:test";
import { rawAPI } from "../rawAPI";
import { useTestAPI } from "../testHelpers";

const UNKNOWN_ID = 999_999_999;

test("--dispatch-- an unknown /api path is a JSON 404", async () => {
	const res = await rawAPI("GET", "/this-route-does-not-exist");
	expect(res.status).toBe(404);
	expect(res.headers.get("Content-Type")).toContain("application/json");
	expect(typeof (await res.json()).error).toBe("string");
});

test("--dispatch-- a known path under another method is a 405 with Allow", async () => {
	const res = await rawAPI("GET", "/books/id");
	expect(res.status).toBe(405);
	expect(res.headers.get("Allow")).toBe("POST");
	expect(typeof (await res.json()).error).toBe("string");
});

test("--dispatch-- a non-numeric [id:number] segment matches no route (404)", async () => {
	expect((await rawAPI("POST", "/pupils/abc")).status).toBe(404);
	expect((await rawAPI("GET", "/announcements/images/12abc")).status).toBe(404);
});

test("--dispatch-- string path params are percent-decoded", async () => {
	// "%62yz" is "byz": the handler only knows the decoded class type.
	const res = await rawAPI("GET", "/teachers/priority/%62yz");
	expect(res.status).toBe(200);
	expect(Array.isArray((await res.json()).data)).toBe(true);
});

test("--dispatch-- an empty id list is a 400, never an empty IN ()", async () => {
	const res = await rawAPI("POST", "/instruments/id", []);
	expect(res.status).toBe(400);
	expect(JSON.stringify((await res.json()).details)).toContain("Δεν επιλέχθηκε καμία εγγραφή");
});

test("--dispatch-- an anonymous caller is turned away before validation (401)", async () => {
	expect((await rawAPI("DELETE", "/books", [])).status).toBe(401);
});

test("--dispatch-- a missing row is a 404 with its Greek message", async () => {
	const pub = await rawAPI("POST", "/instruments/id", [UNKNOWN_ID]);
	expect(pub.status).toBe(404);
	expect((await pub.json()).error).toBe("Το μουσικό όργανο δεν βρέθηκε");

	const auth = await useTestAPI("Books.getById", { RequestObject: [UNKNOWN_ID] });
	expect(auth.status).toBe(404);
	expect((await auth.json()).error).toBe("Το βιβλίο δεν βρέθηκε");
});

test("--dispatch-- inviting an existing admin is a 409", async () => {
	const { TEST_EMAIL } = process.env;
	const res = await useTestAPI("SysUsers.createRegisterLink", { RequestObject: { email: TEST_EMAIL! } });
	expect(res.status).toBe(409);
	expect((await res.json()).error).toBe("Ο χρήστης υπάρχει ήδη");
});

test("--dispatch-- an unknown or used invite link is a 410", async () => {
	const res = await rawAPI("POST", `/sys/register/${R.link(64)}`, { email: `${R.string(12, "a-z")}@example.com`, password: R.string(16) });
	expect(res.status).toBe(410);
	expect((await res.json()).error).toBe("Ο σύνδεσμος εγγραφής δεν είναι έγκυρος ή έχει λήξει");
});

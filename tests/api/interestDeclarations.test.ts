/**
 * «Δήλωση Ενδιαφέροντος» (InterestDeclarations.*): the public form stores a declaration (and emails the secretariat
 * through the local emails worker, which never really sends); admins list and delete them; bots that fill in the
 * honeypot get the same answer but nothing is stored. Test rows use `interest.test.*@example.com` (`bun run dev:clean`).
 */
import { z_InterestDeclaration } from "@lib/api/schemas";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { rawAPI } from "../rawAPI";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

const uniqueEmail = () => `interest.test.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

const valid = (email: string) => ({
	first_name: "  Δοκιμαστική ",
	last_name: "Οικογένεια",
	email,
	phone: "210 1234567",
	message: "Ποιες ημέρες γίνονται τα μαθήματα;\nΕυχαριστώ.",
	page: "contact",
});

const listed = async () => getJson<APIResponse["InterestDeclarations.list"]>(await useTestAPI("InterestDeclarations.list"));

test("--interest-- a public declaration is stored, listed for admins and deleted", async () => {
	const email = uniqueEmail();
	const res = await rawAPI("POST", "/interest-declarations", valid(email));
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ message: "Η δήλωσή σας καταχωρήθηκε. Η Γραμματεία θα επικοινωνήσει μαζί σας σύντομα." });

	const list = await listed();
	expectBody(list, z.array(z_InterestDeclaration));
	const row = list.data.find((r) => r.email === email);
	expect(row).toMatchObject({
		first_name: "Δοκιμαστική",
		last_name: "Οικογένεια",
		phone: "210 1234567",
		message: "Ποιες ημέρες γίνονται τα μαθήματα;\nΕυχαριστώ.",
		page: "contact",
	});

	const removed = await getJson<APIResponse["InterestDeclarations.delete"]>(await useTestAPI("InterestDeclarations.delete", { RequestObject: [row!.id] }));
	expectBody(removed, "Η δήλωση διαγράφηκε");
	expect((await listed()).data.some((r) => r.id === row!.id)).toBe(false);
});

test("--interest-- the message is optional", async () => {
	const email = uniqueEmail();
	const { message: _, ...withoutMessage } = valid(email);
	expect((await rawAPI("POST", "/interest-declarations", withoutMessage)).status).toBe(200);
	const row = (await listed()).data.find((r) => r.email === email);
	expect(row?.message).toBe("");
	await useTestAPI("InterestDeclarations.delete", { RequestObject: [row!.id] });
});

test("--interest-- invalid fields are refused with per-field details", async () => {
	const res = await rawAPI("POST", "/interest-declarations", { first_name: "", last_name: "Χ", email: "not-an-email", phone: "123" });
	expect(res.status).toBe(400);
	const body = (await res.json()) as { details?: { properties?: Record<string, unknown> } };
	expect(Object.keys(body.details?.properties ?? {}).sort()).toEqual(["email", "first_name", "phone"]);
});

test("--interest-- a filled honeypot answers success but stores nothing", async () => {
	const email = uniqueEmail();
	const res = await rawAPI("POST", "/interest-declarations", { ...valid(email), website: "https://spam.example" });
	expect(res.status).toBe(200);
	expect((await listed()).data.some((r) => r.email === email)).toBe(false);
});

test("--interest-- listing and deleting need a session", async () => {
	expect((await rawAPI("GET", "/interest-declarations")).status).toBe(401);
	expect((await rawAPI("DELETE", "/interest-declarations", [1])).status).toBe(401);
});

/**
 * Newsletter subscription routes — moved out of the retired `Registrations`
 * group into `EmailSubscriptions` (paths unchanged, see
 * lib/api/routes/emailSubscriptions.ts).
 *
 * These are the flows behind the unsubscribe links in every sent email, so the
 * round trip (subscribe → token → validate → unsubscribe → validate) is covered
 * end to end.
 */
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { expect, test } from "bun:test";
import { boolean, object, string } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers.ts";

function emailSubscriptionsTest() {
	const email = R.email();
	let token = "";

	test("--email-subscriptions-- #1 subscribe is public", async () => {
		const res = await useTestAPI("EmailSubscriptions.emailSubscribe", { RequestObject: { email } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.emailSubscribe"]>(res);
		expectBody(json, object({ subscribed: boolean() }));
		expect(json.data.subscribed).toBe(true);
	});

	test("--email-subscriptions-- #2 token lookup returns the unsubscribe token", async () => {
		const res = await useTestAPI("EmailSubscriptions.getSubscriptionToken", { RequestObject: { email } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.getSubscriptionToken"]>(res);
		expectBody(json, object({ token: string() }));
		token = json.data.token ?? "";
		expect(token.length).toBeGreaterThan(0);
	});

	test("--email-subscriptions-- #3 token lookup returns null for an unknown email", async () => {
		const res = await useTestAPI("EmailSubscriptions.getSubscriptionToken", { RequestObject: { email: `missing.${R.hex(4)}@example.com` } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.getSubscriptionToken"]>(res);
		expect(json.data.token).toBeNull();
	});

	test("--email-subscriptions-- #4 validate accepts a real token", async () => {
		const res = await useTestAPI("EmailSubscriptions.emailUnsubscribeValidate", { RequestObject: { token } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.emailUnsubscribeValidate"]>(res);
		expectBody(json, object({ isValid: boolean() }));
		expect(json.data.isValid).toBe(true);
	});

	test("--email-subscriptions-- #5 unsubscribe consumes the token", async () => {
		const res = await useTestAPI("EmailSubscriptions.emailUnsubscribe", { RequestObject: { token } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.emailUnsubscribe"]>(res);
		expectBody(json, object({ isValid: boolean() }));
		expect(json.data.isValid).toBe(true);
	});

	test("--email-subscriptions-- #6 validate rejects the consumed token", async () => {
		const res = await useTestAPI("EmailSubscriptions.emailUnsubscribeValidate", { RequestObject: { token } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.emailUnsubscribeValidate"]>(res);
		expectBody(json, object({ isValid: boolean() }));
		expect(json.data.isValid).toBe(false);
	});

	test("--email-subscriptions-- #7 unsubscribe with an unknown token is a no-op", async () => {
		const res = await useTestAPI("EmailSubscriptions.emailUnsubscribe", { RequestObject: { token: `nope-${R.hex(8)}` } }, false);
		const json = await getJson<APIResponse["EmailSubscriptions.emailUnsubscribe"]>(res);
		expectBody(json, object({ isValid: boolean() }));
		expect(json.data.isValid).toBe(false);
	});
}

emailSubscriptionsTest();

/**
 * The activity log's registry and summaries (lib/activity) — no server needed.
 */
import { expect, test } from "bun:test";
import { ACTIVITY_GROUPS, ACTIVITY_LABELS } from "@lib/activity/labels";
import { summarize } from "@lib/activity/record.server";
import { APIEndpoints } from "@lib/api/contract";

test("every logged endpoint exists and changes data (a GET would never be recorded)", () => {
	for (const endpoint of Object.keys(ACTIVITY_LABELS)) {
		const route = (APIEndpoints as Record<string, { method: string }>)[endpoint];
		expect(route, `${endpoint} is not a route`).toBeDefined();
		expect(route!.method, endpoint).not.toBe("GET");
		expect(ACTIVITY_GROUPS[endpoint.split(".")[0]!], `${endpoint} has no category`).toBeString();
	}
});

test("reads sent as POST, sign-ins and public forms are not logged", () => {
	for (const endpoint of [
		"Books.getById",
		"Pupils.search",
		"Pupils.previewFees",
		"PDF.generate",
		"Authentication.userLogin",
		"EmailSubscriptions.emailSubscribe",
	]) {
		expect(ACTIVITY_LABELS[endpoint], endpoint).toBeUndefined();
	}
});

test("summaries name the target without dumping the body", () => {
	expect(summarize({}, [3, 1, 2])).toBe("#3, #1, #2");
	expect(summarize({ id: 7 }, {})).toBe("#7");
	expect(summarize({}, { id: 5, title: "Ανθολογία", price: 12 })).toBe("Ανθολογία · #5");
	expect(summarize({}, { last_name: "Παπαδόπουλος", first_name: "Γιώργος", am: "706", amka: "01010112345" })).toBe("Παπαδόπουλος Γιώργος · ΑΜ 706");
	expect(summarize({}, { id: 9, role: "owner" })).toBe("ρόλος: Ιδιοκτήτης · #9");
	// Never secrets: passwords and tokens are not echoed.
	expect(summarize({ token: "abc" }, { new_password: "hunter22" })).toBe("");
	expect(
		summarize(
			{},
			Array.from({ length: 12 }, (_, i) => i + 1),
		),
	).toBe("#1, #2, #3, #4, #5, #6, #7, #8, +4");
});

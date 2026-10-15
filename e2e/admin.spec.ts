/**
 * Admin smoke tests: sign-in, an ended session, and what each role sees.
 * Every browser sign-in uses a throwaway admin from the `admins` fixture (deleted afterwards).
 */
import type { Page } from "@playwright/test";
import { apiJson, apiSignIn, expect, newApiContext, signInThroughForm, test } from "./support/fixtures";

const NO_ACCESS = "Δεν έχετε πρόσβαση σε αυτή τη σελίδα.";

/** The dashboard's side navigation (desktop) — the phone burger menu holds the same links. */
const adminNav = (page: Page) => page.getByRole("navigation", { name: "Πλοήγηση διαχείρισης" });

test("@phone sign-in with a password lands on «Αρχική» with the «Χρειάζονται προσοχή» tiles", async ({ page, admins }) => {
	const admin = await admins.create();
	await page.goto("/login");
	await signInThroughForm(page, admin);

	await expect(page).toHaveURL(/\/admin$/);
	const attention = page.getByRole("region", { name: "Χρειάζονται προσοχή" });
	await expect(attention.getByRole("heading", { name: "Χρειάζονται προσοχή" })).toBeVisible();
	await expect(attention.getByRole("link", { name: /Προς έλεγχο/ })).toBeVisible();
	await expect(attention.getByRole("link", { name: /Οφειλές/ })).toBeVisible();
	await expect(attention.getByRole("link", { name: /Νέες online εγγραφές/ })).toBeVisible();
});

test("a wrong password is refused on the sign-in screen", async ({ page, admins }) => {
	const admin = await admins.create();
	await page.goto("/login");
	await signInThroughForm(page, { email: admin.email, password: `${admin.password}-wrong` });
	await expect(page.getByRole("alert")).toHaveText("Λάθος email ή κωδικός.");
	await expect(page).toHaveURL(/\/login$/);
});

test.describe("an ended session", () => {
	test("an API call answered 401 sends the admin to «Η συνεδρία σας έληξε» and back to the same page", async ({ page, admins }) => {
		const admin = await admins.create();
		await page.goto("/login?redirect_url=%2Fadmin%2Fpupils");
		await signInThroughForm(page, admin);
		await expect(page).toHaveURL(/\/admin\/pupils$/);
		// Let the page finish loading its data: a request still in flight would hit the 401 before the click below.
		await page.waitForLoadState("networkidle");

		// «Αποσύνδεση των άλλων συσκευών» from a second device ends the browser's session on the server.
		const otherDevice = await newApiContext();
		try {
			await apiSignIn(otherDevice, admin.email, admin.password);
			await apiJson(otherDevice, "DELETE", "/auth/sessions");
		} finally {
			await otherDevice.dispose();
		}

		// A client-side navigation: the page's first API call gets a 401 (lib/auth/sessionExpiry.client.ts).
		await adminNav(page).getByRole("link", { name: "Βιβλία" }).click();
		await expect(page).toHaveURL(/\/login\?redirect_url=%2Fadmin%2Fbooks&expired=1$/);
		await expect(page.getByRole("status")).toContainText("Η συνεδρία σας έληξε");

		await signInThroughForm(page, admin);
		await expect(page).toHaveURL(/\/admin\/books$/);
		await expect(adminNav(page).getByRole("link", { name: "Βιβλία" })).toHaveAttribute("aria-current", "page");
	});

	test("opening a dashboard URL with a dead session cookie says so and returns there", async ({ page, admins }) => {
		const admin = await admins.create();
		await page.goto("/login");
		await signInThroughForm(page, admin);
		await expect(page).toHaveURL(/\/admin$/);
		// As above: the dashboard's own requests must be done, or one of them meets the 401 first.
		await page.waitForLoadState("networkidle");

		const otherDevice = await newApiContext();
		try {
			await apiSignIn(otherDevice, admin.email, admin.password);
			await apiJson(otherDevice, "DELETE", "/auth/sessions");
		} finally {
			await otherDevice.dispose();
		}

		// A full page load: the server-side gate (src/pages/admin/[...slug].astro) sees the stale cookie.
		await page.goto("/admin/teachers?search=e2e");
		await expect(page).toHaveURL(/\/login\?redirect_url=%2Fadmin%2Fteachers%3Fsearch%3De2e&expired=1$/);
		await expect(page.getByRole("status")).toContainText("Η συνεδρία σας έληξε");

		await signInThroughForm(page, admin);
		await expect(page).toHaveURL(/\/admin\/teachers\?search=e2e$/);
	});
});

test.describe("roles", () => {
	test("a secretary sees no restricted links and a typed restricted URL is refused", async ({ page, admins }) => {
		const secretary = await admins.create("secretary");
		await page.goto("/login");
		await signInThroughForm(page, secretary);
		await expect(page).toHaveURL(/\/admin$/);

		const nav = adminNav(page);
		await expect(nav.getByRole("link", { name: "Μαθητολόγιο" })).toBeVisible();
		await expect(nav.getByRole("link", { name: "Ρυθμίσεις" })).toBeVisible();
		await expect(nav.getByRole("link", { name: "Ιστορικό ενεργειών" })).toHaveCount(0);
		await expect(nav.getByRole("link", { name: "Καταγραφή Ερωτημάτων" })).toHaveCount(0);

		// The fee catalog lives in «Ρυθμίσεις», shown only to whoever may edit it.
		await nav.getByRole("link", { name: "Ρυθμίσεις" }).click();
		await expect(page.getByRole("heading", { name: "Ρυθμίσεις" })).toBeVisible();
		await expect(page.getByText("Κατάλογος διδάκτρων")).toHaveCount(0);

		for (const url of ["/admin/query-logs", "/admin/activity"]) {
			await page.goto(url);
			await expect(page.getByText(NO_ACCESS)).toBeVisible();
		}
	});

	test("an owner sees the activity log and the fee catalog, but not the query logs", async ({ page, admins }) => {
		const owner = await admins.create("owner");
		await page.goto("/login");
		await signInThroughForm(page, owner);
		await expect(page).toHaveURL(/\/admin$/);

		const nav = adminNav(page);
		await expect(nav.getByRole("link", { name: "Ιστορικό ενεργειών" })).toBeVisible();
		await expect(nav.getByRole("link", { name: "Καταγραφή Ερωτημάτων" })).toHaveCount(0);

		await nav.getByRole("link", { name: "Ρυθμίσεις" }).click();
		await expect(page.getByText("Κατάλογος διδάκτρων")).toBeVisible();

		await nav.getByRole("link", { name: "Ιστορικό ενεργειών" }).click();
		await expect(page).toHaveURL(/\/admin\/activity$/);
		await expect(page.getByText(NO_ACCESS)).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Ιστορικό ενεργειών" })).toBeVisible();

		await page.goto("/admin/query-logs");
		await expect(page.getByText(NO_ACCESS)).toBeVisible();
	});
});

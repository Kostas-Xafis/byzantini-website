/**
 * The public registration form (/eggrafes, RegistrationForm.solid.tsx): pick a music type → identify
 * (here always "new student": no ΑΜ field, registered with the 000 placeholder) → the form.
 *
 * The happy path writes a real pupil to the dev DB. It is the «Δοκιμαστικός Μαθητής» fixture the API
 * suite uses, with an ΑΜΚΑ no real person has (starts with 99: no day 99) and a
 * `pupils.test.e2e.*@example.com` email; the test deletes it (pupil, enrollment, newsletter row) when it
 * ends, and `bun run dev:clean` matches it too (scripts/cleanDevTestData.ts).
 */
import type { Page } from "@playwright/test";
import { withLocalDb } from "../tests/localDb";
import { expect, test } from "./support/fixtures";

const TEST_FIRST_NAME = "Δοκιμαστικός";
const TEST_LAST_NAME = "Μαθητής";

/** Opens the form of a department as a new student (no ΑΜ field). */
async function openNewStudentForm(page: Page) {
	// The form refuses to submit until the teachers list is in; wait for it like a family would.
	const teachersLoaded = page.waitForResponse((res) => res.url().endsWith("/api/teachers/public") && res.ok());
	await page.goto("/eggrafes");
	await page.getByRole("button", { name: "Βυζαντινή Μουσική" }).click();
	await expect(page.getByRole("heading", { name: "Φόρμα Εγγραφής Βυζαντινής Μουσικής" })).toBeVisible();
	await page.getByRole("button", { name: "Πατήστε εδώ" }).click();
	const form = page.locator("#registrationForm");
	await expect(form).toBeVisible();
	await teachersLoaded;
	return form;
}

/** Removes everything the happy path wrote for `email` from the local dev DB. */
function deleteTestPupil(email: string) {
	withLocalDb((db) => {
		const ids = (
			db.query("SELECT id FROM pupils WHERE email = ? AND first_name = ? AND last_name = ?").all(email, TEST_FIRST_NAME, TEST_LAST_NAME) as {
				id: number;
			}[]
		).map((row) => row.id);
		for (const id of ids) {
			db.run("DELETE FROM pupil_enrollments WHERE pupil_id = ?", [id]);
			db.run("DELETE FROM pupils WHERE id = ?", [id]);
		}
		db.run("DELETE FROM email_subscriptions WHERE email = ?", [email]);
		db.run("UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments)");
	});
}

test("@phone an empty submit lists the required fields and sends nothing", async ({ page }) => {
	const form = await openNewStudentForm(page);
	const posted: string[] = [];
	page.on("request", (req) => {
		if (req.method() === "POST" && new URL(req.url()).pathname === "/api/pupils") posted.push(req.url());
	});

	await form.getByRole("button", { name: "Εγγραφή" }).click();
	const alert = form.getByRole("alert");
	await expect(alert).toContainText("Συμπληρώστε τα υποχρεωτικά πεδία:");
	for (const label of ["ΑΜΚΑ", "Επώνυμο", "Όνομα", "Πατρώνυμο", "Κινητό", "Email", "Ημερομηνία Γέννησης", "Έτος Φοίτησης"]) {
		await expect(alert).toContainText(label);
	}
	// A new student has no ΑΜ field, and the school year is already filled in.
	await expect(alert).not.toContainText("Αριθμός Μητρώου");
	await expect(alert).not.toContainText("Σχολικό Έτος");
	// The first missing field gets the focus.
	await expect(form.locator("input[name='amka']")).toBeFocused();
	expect(posted).toEqual([]);
});

test("@phone a new student (no ΑΜ field) registers successfully", async ({ page }, testInfo) => {
	const tag = `${Date.now().toString(36)}${testInfo.project.name}`;
	const email = `pupils.test.e2e.${tag}@example.com`;
	const amka = `99${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
	try {
		const form = await openNewStudentForm(page);
		// No ΑΜ field for a new student: the form sends the 000 placeholder itself (checked in the DB below).
		await expect(form.locator("input[name='am']")).toHaveCount(0);

		// «Υπό Κατάταξη» first: it hides the teacher field (and needs no teacher), which re-renders that part of the form.
		await form.locator("select[name='class_year']").selectOption("Υπό Κατάταξη");
		await expect(form.locator("select[name='teacher_id']")).toBeHidden();

		await form.locator("input[name='amka']").fill(amka);
		await form.locator("input[name='last_name']").fill(TEST_LAST_NAME);
		await form.locator("input[name='first_name']").fill(TEST_FIRST_NAME);
		await form.locator("input[name='fathers_name']").fill(TEST_FIRST_NAME);
		await form.locator("input[name='cellphone']").fill(`69${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`);
		await form.locator("input[name='email']").fill(email);
		await form.locator("input[name='road']").fill("Οδός Δοκιμής");
		await form.locator("input[name='number']").fill("1");
		await form.locator("input[name='tk']").fill("14452");
		await form.locator("input[name='region']").fill("Μεταμόρφωση");

		// The date field (DateInput.solid.tsx) reads ηη/μμ/εεεε whatever the browser's language.
		const birthDate = form.locator("input[name='birth_date']");
		await birthDate.fill("15/03/2015");
		await expect(birthDate).toHaveValue("15/03/2015");

		const posted = page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/pupils");
		await form.getByRole("button", { name: "Εγγραφή" }).click();
		const response = await posted;
		expect(response.status(), await response.text()).toBe(200);
		const { data } = await response.json();
		expect(data.pupilId).toBeGreaterThan(0);

		await expect(page.getByText("Επιτυχής Εγγραφή")).toBeVisible();
		await expect(form.getByRole("alert")).toHaveCount(0);

		// What was written: a pupil without ΑΜ, flagged for the secretaries, with this year's enrollment from the form.
		const row = withLocalDb(
			(db) =>
				db
					.query(
						`SELECT p.am, p.orphan_code, p.needs_review, e.class_id, e.class_year, e.evaluation, e.source
						FROM pupils p JOIN pupil_enrollments e ON e.pupil_id = p.id WHERE p.id = ?`,
					)
					.get(data.pupilId) as Record<string, unknown> | null,
		);
		if (row !== null) {
			expect(row).toMatchObject({ am: null, needs_review: 1, class_id: 0, class_year: "", evaluation: 1, source: "form" });
			expect(String(row.orphan_code)).toMatch(/^000-Ο\d+$/);
		}
	} finally {
		deleteTestPupil(email);
	}
});

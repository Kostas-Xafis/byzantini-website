/**
 * The public teachers page (/kathigites): the category toolbar (heading + URL hash) and the accent-insensitive search.
 * Read-only: no sign-in, nothing is written.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

const HEADINGS = {
	par: "Καθηγητές Παραδοσιακής Μουσικής",
	eur: "Καθηγητές Ευρωπαϊκής Μουσικής",
	byz: "Καθηγητές Βυζαντινής Μουσικής",
} as const;

// The wrapper and the button both carry data-type; the button is the control (works as a plain button or a tab).
const categoryButton = (page: Page, type: keyof typeof HEADINGS) => page.locator(`#btsContainer button[data-type="${type}"]`);
const visibleCards = (page: Page) => page.locator(".teacher-card:not([data-filtered]):visible");

test.describe("teachers page", () => {
	test("@phone switching category changes the heading and the URL hash", async ({ page }) => {
		await page.goto("/kathigites");
		const head = page.locator("#teachersHead");
		await expect(head).toHaveText(HEADINGS.byz);

		await categoryButton(page, "par").click();
		await expect(head).toHaveText(HEADINGS.par);
		await expect(page).toHaveURL(/#(Παραδοσιακή|%CE%A0%CE%B1%CF%81%CE%B1%CE%B4%CE%BF%CF%83%CE%B9%CE%B1%CE%BA%CE%AE)/);
		expect(decodeURIComponent(new URL(page.url()).hash)).toBe("#Παραδοσιακή Μουσική");

		await categoryButton(page, "eur").click();
		await expect(head).toHaveText(HEADINGS.eur);
		expect(decodeURIComponent(new URL(page.url()).hash)).toBe("#Ευρωπαϊκή Μουσική");

		await categoryButton(page, "byz").click();
		await expect(head).toHaveText(HEADINGS.byz);
		expect(decodeURIComponent(new URL(page.url()).hash)).toBe("#Βυζαντινή Μουσική");
	});

	test("opening the page with a category hash selects that category", async ({ page }) => {
		await page.goto("/kathigites#" + encodeURIComponent("Ευρωπαϊκή Μουσική"));
		await expect(page.locator("#teachersHead")).toHaveText(HEADINGS.eur);
	});

	test("@phone search filters the cards accent-insensitively and shows the empty message", async ({ page }) => {
		await page.goto("/kathigites");
		await expect(visibleCards(page).first()).toBeVisible();
		const all = await visibleCards(page).count();
		const search = page.locator("#teachersSearch");
		const empty = page.locator("#teachersEmpty");
		await expect(empty).toBeHidden();

		// Take a word from the first card's own search text, then retype it with its accents stripped / upper-cased.
		const word = await page
			.locator(".teacher-card:visible")
			.first()
			.evaluate((card) => {
				const text = ((card as HTMLElement).dataset.search ?? "").split(/\s+/).filter((w) => w.length >= 4);
				return text[0] ?? "";
			});
		test.skip(!word, "no searchable word on the first card");

		await search.fill(word.toUpperCase());
		await expect(visibleCards(page).first()).toBeVisible();
		expect(await visibleCards(page).count()).toBeLessThanOrEqual(all);
		await expect(empty).toBeHidden();

		// A string no teacher can match.
		await search.fill("ζζζζξξξξ");
		await expect(visibleCards(page)).toHaveCount(0);
		await expect(empty).toBeVisible();

		// Clearing brings the cards back.
		await search.fill("");
		await expect(empty).toBeHidden();
		await expect(visibleCards(page)).toHaveCount(all);
	});

	test("search ignores accents: the same query with and without tonos finds the same cards", async ({ page }) => {
		await page.goto("/kathigites");
		const search = page.locator("#teachersSearch");
		await search.fill("μουσικη");
		const plain = await visibleCards(page).count();
		await search.fill("μουσική");
		await expect(visibleCards(page)).toHaveCount(plain);
	});
});

/**
 * The public navbar (src/components/Navbar.astro, docs/IMPROVEMENTS.md B8): every top-level link must be
 * reachable on a tablet / small laptop (1024 px, burger menu) and the most common laptop (1366 px, full bar).
 */
import { expect, test } from "./support/fixtures";

const TOP_LINKS = ["Αρχική", "Εγγραφές", "Καθηγητές", "Σπουδαστήρια", "Επικοινωνία"];

test.describe("public navbar", () => {
	test.use({ viewport: { width: 1024, height: 768 } });

	test("at 1024 px the burger menu opens and reaches every page", async ({ page }) => {
		await page.goto("/");
		// Measure the settled layout (dev mode injects the styles after the HTML).
		await page.waitForLoadState("networkidle");
		const menu = page.locator("#mobile-nav-menu");
		await page.getByLabel("Περιήγηση").click();
		for (const name of TOP_LINKS) await expect(menu.getByRole("link", { name, exact: true })).toBeInViewport();
		await expect(menu.getByText("Η Σχολή μας")).toBeInViewport();

		await menu.getByRole("link", { name: "Επικοινωνία", exact: true }).click();
		await expect(page).toHaveURL(/\/epikoinonia\/?$/);
	});
});

test.describe("public navbar", () => {
	test.use({ viewport: { width: 1366, height: 768 } });

	test("at 1366 px every link fits in the bar and the «Η Σχολή μας» menu opens", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");
		const bar = page.locator("nav:has(#mobile-nav-toggle)");
		await expect(page.getByLabel("Περιήγηση")).toBeHidden();
		for (const name of TOP_LINKS) {
			const link = bar.getByRole("link", { name, exact: true });
			await expect(link).toBeInViewport({ ratio: 1 });
		}
		// «Η Σχολή μας» is a focusable group: its menu opens on hover and on keyboard focus (focus is what stays
		// open while the pointer moves to a link).
		const school = bar.locator("[tabindex='0']").filter({ hasText: "Η Σχολή μας" });
		await expect(school).toBeInViewport({ ratio: 1 });
		await school.focus();
		const announcements = bar.getByRole("link", { name: "Ανακοινώσεις" });
		await expect(announcements).toBeInViewport();
		await announcements.click();
		await expect(page).toHaveURL(/\/sxoli\/anakoinoseis\/?$/);
	});
});

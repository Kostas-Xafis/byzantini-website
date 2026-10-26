/**
 * The admin file input inside a modal (Σπουδαστήρια → «Προσθήκη»): preview + «Νέο» badge for a picked image,
 * «Αφαίρεση αρχείου» back to the empty drop zone, a non-image file rejected. Never submits: nothing is written.
 */
import type { Page } from "@playwright/test";
import { expect, signInThroughForm, test } from "./support/fixtures";

// 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function openAddModal(page: Page) {
	await page.goto("/admin/locations");
	await page.getByRole("button", { name: "Προσθήκη", exact: true }).first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	return dialog;
}

test("admin file input: preview, «Νέο» badge, removal and rejecting a non-image", async ({ page, admins }) => {
	const admin = await admins.create("secretary");
	await page.goto("/login");
	await signInThroughForm(page, admin);
	await expect(page).toHaveURL(/\/admin$/);

	const dialog = await openAddModal(page);
	const field = dialog.locator(".file-field").first();
	const input = field.locator('input[type="file"]');
	const dropZone = field.getByRole("button", { name: /επιλέξτε/ });
	await expect(dropZone).toBeVisible();

	// A non-image is refused: the field stays empty.
	await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
	await expect(dropZone).toBeVisible();
	await expect(field.getByText("Νέο", { exact: true })).toHaveCount(0);

	// An image shows its preview and the «Νέο» badge.
	await input.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
	await expect(field.getByText("Νέο", { exact: true })).toBeVisible();
	await expect(field.locator("img")).toBeVisible();
	await expect(field.getByText("photo.png")).toBeVisible();
	await expect(dropZone).toHaveCount(0);

	// Removing it returns to the empty drop zone.
	await field.getByRole("button", { name: "Αφαίρεση αρχείου" }).click();
	await expect(field.getByText("Νέο", { exact: true })).toHaveCount(0);
	await expect(dropZone).toBeVisible();

	// Cancel without submitting.
	await dialog.getByRole("button", { name: "Ακύρωση" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

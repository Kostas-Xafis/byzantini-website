import { test as base, expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import type { Role } from "../../lib/auth/roles";
import { withLocalDb } from "../../tests/localDb";
import { BASE_URL, harnessCredentials } from "./env";

/**
 * Shared fixtures:
 *
 * - `harness` (per worker): an API client signed in as the harness admin (tests/.env.test, a sysadmin).
 *   It invites, promotes and deletes the throwaway admins; it never drives the browser. Signed out at the end.
 * - `cspViolations` (automatic): fails the test when the page reports a Content-Security-Policy violation.
 * - `admins` (per test): creates throwaway `e2e.<role>.<random>@example.com` admins the way a real one is
 *   made (invite → `POST /api/sys/register/<link>`, then `SysUsers.setRole` for an owner) and deletes every
 *   one of them when the test ends, passed or failed, with the activity-log rows about them. Inviting needs
 *   the emails worker (dry-run locally).
 */

export type TestAdmin = { id: number; email: string; password: string; role: Role };

/** A request context that talks to the site like the browser does (JSON bodies, an `Origin` header). */
export const newApiContext = () => playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });

/** `/api` call that fails the test with the server's answer (not just the status) when it is not 200. */
export async function apiJson<T = any>(api: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
	const res = await api.fetch(`/api${path}`, { method, data });
	const text = await res.text();
	expect(res.status(), `${method} /api${path} → ${res.status()}: ${text}`).toBe(200);
	return JSON.parse(text).data as T;
}

/** Signs `api` in with a password (its cookie jar then holds the session, as another device would). */
export async function apiSignIn(api: APIRequestContext, email: string, password: string) {
	const data = await apiJson<{ isValid: boolean }>(api, "POST", "/auth/login", { email, password });
	expect(data.isValid, `sign-in as ${email}`).toBe(true);
}

/** The admin-management endpoints whose «Ιστορικό ενεργειών» rows (sys_activity) the fixture writes. */
const ADMIN_ENDPOINTS = ["SysUsers.createRegisterLink", "SysUsers.setRole", "SysUsers.delete"];

/**
 * Removes the activity-log rows about the throwaway admins (their invite, role change and deletion by the
 * harness admin, and anything they did themselves), so the log keeps no trace of the run. Best-effort: the
 * local dev DB may not be reachable (`E2E_BASE_URL` on another machine); `bun run dev:clean` is the fallback.
 */
function forgetActivity(admins: Pick<TestAdmin, "id" | "email">[], since: number) {
	if (admins.length === 0) return;
	const emails = new Set(admins.map((admin) => admin.email));
	const ids = new Set(admins.map((admin) => `#${admin.id}`));
	const aboutTestAdmins = (summary: string | null) =>
		!!summary && (emails.has(summary) || summary.split(/ · |, /).some((part) => ids.has(part) || emails.has(part)));
	withLocalDb((db) => {
		const rows = db.query(`SELECT id, user_email, endpoint, summary FROM sys_activity WHERE created_at >= ?`).all(since - 1_000) as {
			id: number;
			user_email: string;
			endpoint: string;
			summary: string | null;
		}[];
		for (const row of rows) {
			if (emails.has(row.user_email) || (ADMIN_ENDPOINTS.includes(row.endpoint) && aboutTestAdmins(row.summary))) {
				db.run("DELETE FROM sys_activity WHERE id = ?", [row.id]);
			}
		}
	});
}

const randomTag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Signs in on /login through the form, as an admin would. Does not wait for the destination. */
export async function signInThroughForm(page: Page, admin: Pick<TestAdmin, "email" | "password">) {
	await page.getByLabel("Email").fill(admin.email);
	await page.getByLabel("Κωδικός").fill(admin.password);
	await page.getByRole("button", { name: "Είσοδος", exact: true }).click();
}

export const test = base.extend<{ admins: { create: (role?: Role) => Promise<TestAdmin> }; cspViolations: void }, { harness: APIRequestContext }>({
	// Every test fails on a Content-Security-Policy violation (src/middleware.ts sends a strict CSP on the
	// dashboard and the sign-in pages): a blocked script or style may not break the assertions, so it is
	// reported here instead — fix the page or the policy, never the test.
	cspViolations: [
		async ({ page }, use) => {
			const violations: string[] = [];
			page.on("console", (message) => {
				if (/Content[- ]Security[- ]Policy/i.test(message.text())) violations.push(`${page.url()}: ${message.text()}`);
			});
			await use();
			expect(violations, "CSP violations").toEqual([]);
		},
		{ auto: true },
	],
	harness: [
		async ({}, use) => {
			const api = await newApiContext();
			const { email, password } = harnessCredentials();
			await apiSignIn(api, email, password);
			await use(api);
			// Leave no extra harness session behind.
			await api.post("/api/auth/logout").catch(() => {});
			await api.dispose();
		},
		{ scope: "worker" },
	],
	admins: async ({ harness }, use) => {
		const created: Pick<TestAdmin, "id" | "email">[] = [];
		const startedAt = Date.now();
		await use({
			async create(role: Role = "secretary") {
				const email = `e2e.${role}.${randomTag()}@example.com`;
				const password = `E2e-${randomTag()}-${randomTag()}`;
				const { link } = await apiJson<{ link: string }>(harness, "POST", "/sys/register", { email });
				const signup = await newApiContext();
				try {
					const { id } = await apiJson<{ id: number }>(signup, "POST", `/sys/register/${link}`, { email, password });
					created.push({ id, email });
					// The signup opened a session of its own; it is not needed.
					await signup.post("/api/auth/logout").catch(() => {});
					if (role !== "secretary") await apiJson(harness, "PUT", "/sys/role", { id, role });
					return { id, email, password, role };
				} finally {
					await signup.dispose();
				}
			},
		});
		if (created.length)
			await apiJson(
				harness,
				"DELETE",
				"/sys",
				created.map((admin) => admin.id),
			);
		forgetActivity(created, startedAt);
	},
});

export { expect };

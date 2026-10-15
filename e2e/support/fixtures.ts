import { test as base, expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import type { Role } from "../../lib/auth/roles";
import { BASE_URL, harnessCredentials } from "./env";

/**
 * Shared fixtures:
 *
 * - `harness` (per worker): an API client signed in as the harness admin (tests/.env.test, a sysadmin).
 *   It invites, promotes and deletes the throwaway admins; it never drives the browser. Signed out at the end.
 * - `admins` (per test): creates throwaway `e2e.<role>.<random>@example.com` admins the way a real one is
 *   made (invite → `POST /api/sys/register/<link>`, then `SysUsers.setRole` for an owner) and deletes every
 *   one of them when the test ends, passed or failed. Inviting needs the emails worker (dry-run locally).
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

const randomTag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Signs in on /login through the form, as an admin would. Does not wait for the destination. */
export async function signInThroughForm(page: Page, admin: Pick<TestAdmin, "email" | "password">) {
	await page.getByLabel("Email").fill(admin.email);
	await page.getByLabel("Κωδικός").fill(admin.password);
	await page.getByRole("button", { name: "Είσοδος", exact: true }).click();
}

export const test = base.extend<{ admins: { create: (role?: Role) => Promise<TestAdmin> } }, { harness: APIRequestContext }>({
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
		const created: number[] = [];
		await use({
			async create(role: Role = "secretary") {
				const email = `e2e.${role}.${randomTag()}@example.com`;
				const password = `E2e-${randomTag()}-${randomTag()}`;
				const { link } = await apiJson<{ link: string }>(harness, "POST", "/sys/register", { email });
				const signup = await newApiContext();
				try {
					const { id } = await apiJson<{ id: number }>(signup, "POST", `/sys/register/${link}`, { email, password });
					created.push(id);
					// The signup opened a session of its own; it is not needed.
					await signup.post("/api/auth/logout").catch(() => {});
					if (role !== "secretary") await apiJson(harness, "PUT", "/sys/role", { id, role });
					return { id, email, password, role };
				} finally {
					await signup.dispose();
				}
			},
		});
		if (created.length) await apiJson(harness, "DELETE", "/sys", created);
	},
});

export { expect };

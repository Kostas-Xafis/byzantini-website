/**
 * Unit tests for lib/utilities/redirect.ts — the `?redirect_url=` plumbing that
 * takes a logged-out admin from a shared deep link (e.g.
 * `/admin/pupils?q=παπαδόπουλος`) through the sign-in screen and back.
 *
 * Pure functions plus a tiny cookie jar standing in for `document.cookie`, so
 * these tests need no dev server, no DB and no env file.
 */
import { afterAll, beforeEach, expect, test } from "bun:test";
import {
	ADMIN_HOME,
	buildLoginUrl,
	currentRedirectTarget,
	isSafeRedirectTarget,
	readRedirectTarget,
	rememberRedirectTarget,
	takeRedirectTarget,
} from "@utilities/redirect";

// ---------------------------------------------------------------------------
// `?redirect_url=` parsing / validation
// ---------------------------------------------------------------------------

test("readRedirectTarget returns the decoded target of the login URL", () => {
	expect(readRedirectTarget(`?redirect_url=${encodeURIComponent("/admin/pupils?q=παπαδόπουλος&pupil=706")}`)).toBe("/admin/pupils?q=παπαδόπουλος&pupil=706");
});

test("readRedirectTarget accepts an unencoded same-site path", () => {
	expect(readRedirectTarget("redirect_url=/admin/books?search=x")).toBe("/admin/books?search=x");
});

test("readRedirectTarget returns null when there is nothing to return to", () => {
	expect(readRedirectTarget("")).toBeNull();
	expect(readRedirectTarget("?pupil=706")).toBeNull();
	expect(readRedirectTarget("?redirect_url=")).toBeNull();
});

test("readRedirectTarget rejects every target that could leave the site", () => {
	const unsafe = [
		"//evil.example",
		"/\\evil.example",
		"\\\\evil.example",
		"https://evil.example/admin",
		"javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"/etc/passwd",
		"admin/pupils",
		"/administrator",
		"/admin is spaced",
		"/admin\n/../evil",
	];
	for (const value of unsafe) {
		expect({ value, target: readRedirectTarget(`?redirect_url=${encodeURIComponent(value)}`) }).toEqual({ value, target: null });
	}
});

test("isSafeRedirectTarget keeps dashboard paths and drops everything else", () => {
	expect(isSafeRedirectTarget(ADMIN_HOME)).toBe(true);
	expect(isSafeRedirectTarget("/admin/query-logs?page=2")).toBe(true);
	expect(isSafeRedirectTarget("/admin?tab=users")).toBe(true);
	expect(isSafeRedirectTarget("/admin/pupils?q=" + "α".repeat(600))).toBe(false); // oversized
	expect(isSafeRedirectTarget("/admin#frag")).toBe(true);
	expect(isSafeRedirectTarget(undefined)).toBe(false);
	expect(isSafeRedirectTarget(null)).toBe(false);
	expect(isSafeRedirectTarget(42)).toBe(false);
});

// ---------------------------------------------------------------------------
// Login URL building
// ---------------------------------------------------------------------------

test("buildLoginUrl carries the target and reads back unchanged", () => {
	const targets = ["/admin/pupils?q=παπαδόπουλος&pupil=706", "/admin/registrations?year=2024&search=a%20b#top", "/admin/books?search=a&b=c&d=e"];
	for (const target of targets) {
		const loginUrl = buildLoginUrl(target);
		expect(loginUrl.startsWith("/login?redirect_url=")).toBe(true);
		expect(readRedirectTarget(new URL(loginUrl, "https://byzantini.gr").search)).toBe(target);
	}
});

test("buildLoginUrl stays bare when there is nothing to return to", () => {
	expect(buildLoginUrl(null)).toBe("/login");
	expect(buildLoginUrl(undefined)).toBe("/login");
	expect(buildLoginUrl(ADMIN_HOME)).toBe("/login"); // the dashboard home is the default anyway
	expect(buildLoginUrl("//evil.example")).toBe("/login");
	expect(buildLoginUrl("/admin\n/x")).toBe("/login");
});

// ---------------------------------------------------------------------------
// The URL the guard hands over
// ---------------------------------------------------------------------------

test("currentRedirectTarget keeps path, query and hash", () => {
	expect(currentRedirectTarget({ pathname: "/admin/pupils", search: "?q=παπαδόπουλος", hash: "" })).toBe("/admin/pupils?q=παπαδόπουλος");
	expect(currentRedirectTarget({ pathname: "/admin/pupils", search: "", hash: "#top" })).toBe("/admin/pupils#top");
	expect(currentRedirectTarget({ pathname: "/admin", search: "", hash: "" })).toBe(ADMIN_HOME);
});

test("a deep link survives the whole guard → login → target round trip", () => {
	const requested = currentRedirectTarget({ pathname: "/admin/registrations", search: "?year=2024&search=%CE%A0%CE%B1%CF%80%CE%B1&col=1", hash: "" });
	const loginUrl = buildLoginUrl(requested);
	const restored = readRedirectTarget(new URL(loginUrl, "https://byzantini.gr").search);
	expect(restored).toBe(requested);
	expect(restored).toContain("year=2024");
	expect(restored).toContain("col=1");
});

// ---------------------------------------------------------------------------
// The Google detour (cookie handoff, read via document.cookie on the callback)
// ---------------------------------------------------------------------------

/** Minimal browser-like cookie jar: honours `expires`, enough for setCookie/getCookie/deleteCookie. */
class FakeCookieJar {
	private jar = new Map<string, string>();

	clear() {
		this.jar.clear();
	}

	get cookie(): string {
		return [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
	}

	set cookie(raw: string) {
		const [pair] = raw.split(";");
		const eq = pair.indexOf("=");
		const name = pair.slice(0, eq);
		const value = pair.slice(eq + 1);
		const expires = /expires=([^;]+)/i.exec(raw)?.[1];
		if (expires && new Date(expires).getTime() <= Date.now()) this.jar.delete(name);
		else this.jar.set(name, value);
	}
}

const originalDocument = (globalThis as any).document;
const jar = new FakeCookieJar();
(globalThis as any).document = {
	get cookie() {
		return jar.cookie;
	},
	set cookie(raw: string) {
		jar.cookie = raw;
	},
};

beforeEach(() => {
	jar.clear();
});
afterAll(() => {
	(globalThis as any).document = originalDocument;
});

test("rememberRedirectTarget / takeRedirectTarget hand the target to the OAuth callback", () => {
	const target = "/admin/pupils?q=παπαδόπουλος&pupil=706";
	rememberRedirectTarget(target);
	expect(jar.cookie).toContain("login_redirect_url=");
	expect(takeRedirectTarget()).toBe(target);
	// consumed — a later Google sign-in must not reuse it
	expect(takeRedirectTarget()).toBeNull();
});

test("rememberRedirectTarget stores nothing when there is nothing to store", () => {
	rememberRedirectTarget(null);
	rememberRedirectTarget(ADMIN_HOME);
	rememberRedirectTarget("//evil.example");
	expect(takeRedirectTarget()).toBeNull();
});

test("takeRedirectTarget survives a corrupt or unsafe cookie", () => {
	rememberRedirectTarget("/admin/books?search=x");
	(globalThis as any).document.cookie = "login_redirect_url=%E0%A4%A; path=/";
	expect(takeRedirectTarget()).toBeNull();
});

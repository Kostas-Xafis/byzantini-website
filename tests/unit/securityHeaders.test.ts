import { BASELINE_CSP, BASELINE_HEADERS, HSTS, securityHeadersFor, STRICT_CSP, usesStrictCsp, withSecurityHeaders } from "@utilities/securityHeaders";
import { expect, test } from "bun:test";

test("the dashboard and sign-in pages get the strict policy, the public site the baseline", () => {
	for (const path of ["/admin", "/admin/pupils", "/login", "/login/forgot", "/oauth2callback", "/oauth2callback/apple"])
		expect(usesStrictCsp(path), path).toBe(true);
	for (const path of ["/", "/administrator", "/loginx", "/eggrafes", "/choir/a.jpg"]) expect(usesStrictCsp(path), path).toBe(false);

	const admin = securityHeadersFor(new URL("https://example.org/admin/pupils"));
	expect(admin["Content-Security-Policy"]).toBe(STRICT_CSP);
	expect(admin["X-Frame-Options"]).toBe("DENY");
	expect(admin["Strict-Transport-Security"]).toBe(HSTS);
	const page = securityHeadersFor(new URL("http://localhost:4321/"), true);
	expect(page["Content-Security-Policy"]).toBe(BASELINE_CSP);
	expect(page["Strict-Transport-Security"]).toBeUndefined();
	expect(securityHeadersFor(new URL("http://localhost:4321/admin"), true)["Content-Security-Policy"]).toContain("connect-src 'self' ws: wss:");
	expect(STRICT_CSP).toContain("frame-ancestors 'none'");
	expect(STRICT_CSP).not.toContain("unsafe-eval");
});

test("headers already on the response win, immutable responses are copied", () => {
	const own = new Response("x", { headers: { "Content-Security-Policy": "default-src 'none'; sandbox" } });
	const out = withSecurityHeaders(own, securityHeadersFor(new URL("https://example.org/a.svg")));
	expect(out.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
	expect(out.headers.get("X-Content-Type-Options")).toBe("nosniff");

	const immutable = Response.redirect("https://example.org/", 302);
	const copied = withSecurityHeaders(immutable, BASELINE_HEADERS);
	expect(copied.status).toBe(302);
	expect(copied.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
});

test("public/_headers matches the module (prerendered pages)", async () => {
	const text = await Bun.file("public/_headers").text();
	const rules = new Map<string, Record<string, string>>();
	let current: Record<string, string> | undefined;
	for (const line of text.split("\n")) {
		if (!line.trim() || line.startsWith("#")) continue;
		if (!line.startsWith(" ")) rules.set(line.trim(), (current = {}));
		else {
			const at = line.indexOf(":");
			current![line.slice(0, at).trim()] = line.slice(at + 1).trim();
		}
	}
	expect(rules.get("/*")).toEqual({ ...BASELINE_HEADERS, "Content-Security-Policy": BASELINE_CSP, "Strict-Transport-Security": HSTS });
	expect(rules.get("/login/*")).toEqual({ "Content-Security-Policy": STRICT_CSP });
});

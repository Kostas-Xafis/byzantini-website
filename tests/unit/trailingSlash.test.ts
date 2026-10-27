import { describe, expect, test } from "bun:test";
import { canonicalPath, trailingSlashRedirect } from "@utilities/trailingSlash";

const redirect = (path: string, method = "GET") => trailingSlashRedirect(method, new URL(path, "https://musicschool-metamorfosi.gr"));

describe("trailingSlashRedirect", () => {
	test("page paths without a slash go to the slash version, query string kept", () => {
		expect(redirect("/kathigites")).toBe("https://musicschool-metamorfosi.gr/kathigites/");
		expect(redirect("/sxoli/anakoinoseis?x=1&y=2")).toBe("https://musicschool-metamorfosi.gr/sxoli/anakoinoseis/?x=1&y=2");
		expect(redirect("/spoudastiria/some-place", "HEAD")).toBe("https://musicschool-metamorfosi.gr/spoudastiria/some-place/");
	});

	test("an announcement title may hold dots without being a file", () => {
		const location = redirect("/sxoli/anakoinoseis/" + encodeURIComponent("Βράβευση π. Χρίστου") + "?a=1");
		expect(location).toBe("https://musicschool-metamorfosi.gr/sxoli/anakoinoseis/" + encodeURIComponent("Βράβευση π. Χρίστου") + "/?a=1");
		expect(redirect("/sxoli/anakoinoseis/Εκδήλωση 25.3")).not.toBeNull();
		// outside the announcements, "name.ext" is a file
		expect(redirect("/kathigites/cv/" + encodeURIComponent("π. Αλεβιζάκης.pdf"))).toBeNull();
	});

	test("already slash-terminated and the root are left alone", () => {
		expect(redirect("/")).toBeNull();
		expect(redirect("/kathigites/")).toBeNull();
		expect(redirect("/sxoli/anakoinoseis/x/?a=1")).toBeNull();
	});

	test("files are left alone", () => {
		for (const path of [
			"/logo.png",
			"/favicon.svg",
			"/sitemap-index.xml",
			"/sitemap-0.xml",
			"/robots.txt",
			"/kathigites/cv/x.pdf",
			"/fonts/ANAKTORIA.OTF",
			"/llms.txt",
		])
			expect(redirect(path), path).toBeNull();
	});

	test("api, admin, login, oauth callbacks, unsubscribe links and framework error pages are left alone", () => {
		for (const path of [
			"/api",
			"/api/health",
			"/api/teachers/priority/byz",
			"/admin",
			"/admin/pupils",
			"/login",
			"/login/reset/abc",
			"/oauth2callback",
			"/oauth2callback/apple",
			"/unsubscribe/abc",
			"/.well-known/acme-challenge/x",
			"/404",
			"/500",
		])
			expect(redirect(path), path).toBeNull();
		// but a look-alike prefix is a page
		expect(redirect("/administrator")).not.toBeNull();
		expect(redirect("/apiary")).not.toBeNull();
	});

	test("only GET and HEAD are redirected", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect(redirect("/kathigites", method), method).toBeNull();
	});

	test("the target stays on the request's own origin, whatever the path looks like", () => {
		const url = new URL("https://musicschool-metamorfosi.gr//evil.com/x");
		const location = trailingSlashRedirect("GET", url);
		expect(location).toBe("https://musicschool-metamorfosi.gr//evil.com/x/");
		expect(new URL(location!).origin).toBe("https://musicschool-metamorfosi.gr");
	});
});

describe("canonicalPath", () => {
	test("adds the slash to pages, keeps files, the root and slash paths", () => {
		expect(canonicalPath("/kathigites")).toBe("/kathigites/");
		expect(canonicalPath("/kathigites/")).toBe("/kathigites/");
		expect(canonicalPath("/")).toBe("/");
		expect(canonicalPath("/logo.png")).toBe("/logo.png");
	});
});

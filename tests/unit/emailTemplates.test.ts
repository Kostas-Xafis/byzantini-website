/**
 * Template-name integrity for the "Επιτυχής εγγραφή" emails.
 *
 * The website selects a static HTML template by name and posts that name to the
 * email worker, which reads it straight from R2 (`html_templates/<name>`). A typo
 * in the name is therefore not a build error — it is a runtime 400 that the caller
 * ignores, so the student silently gets no confirmation email.
 *
 * That is exactly what happened: `byzantineBDiploma` pointed at
 * `epitixis/epitixis_eggrafi_b_diploma.html` (no `byzantine_`) while the built file
 * is `epitixis/epitixis_eggrafi_byzantine_b_diploma.html`, so every Β' Ετος
 * Διπλώματος student of the Βυζαντινή department was skipped for months (fixed
 * 2026-09-15, regression from the pupils refactor).
 *
 * These tests read the two source files as text and compare the names, so they need
 * no DB, no dev server and no env file — and they still fail if either registry is
 * renamed to a file that was never built.
 */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../..");

/** The website → worker contract: names sent as `htmlTemplateName`. */
const pupilsRoutePath = path.join(repoRoot, "lib/api/routes/pupils.ts");
/** The worker's build registry (render/emails → html_templates). */
const emailRegistryPath = path.join(repoRoot, "services/emailWorker/render/index.tsx");
/** Where `bun run templates:build` writes the files the worker later reads from R2. */
const builtTemplatesDir = path.join(repoRoot, "services/emailWorker/html_templates");
/** Mirror published with `templates:build --prod`, when it is present locally. */
const publishedTemplatesDir = path.join(repoRoot, "bucket/latest/html_templates");

/** `{ key: "value", … }` pairs from the first matching object literal. */
function objectEntries(source: string, startPattern: RegExp): Map<string, string> {
	const start = source.search(startPattern);
	expect(start, `could not find ${startPattern} in the source`).toBeGreaterThanOrEqual(0);
	const body = source.slice(start);
	const end = body.search(/\n\} as const;|\n\};/);
	expect(end, `could not find the end of ${startPattern}`).toBeGreaterThan(0);
	return new Map([...body.slice(0, end).matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
}

/** `{ name: "…" }` entries of the worker's `templates` registry. */
function registryNames(source: string): Set<string> {
	return new Set([...source.matchAll(/name:\s*"([^"]+\.html)"/g)].map((m) => m[1]!));
}

const pupilsRoute = readFileSync(pupilsRoutePath, "utf8");
const emailRegistry = readFileSync(emailRegistryPath, "utf8");

const siteTemplates = objectEntries(pupilsRoute, /const successfulRegistrationTemplates = \{/);
const registryTemplates = registryNames(emailRegistry);

test("the website's registration template map is non-empty", () => {
	// Guards against the regex silently matching nothing after a refactor.
	expect(siteTemplates.size).toBeGreaterThanOrEqual(7);
});

test("every registration template name is declared in the worker's registry", () => {
	const missing = [...siteTemplates.entries()].filter(([, name]) => !registryTemplates.has(name));
	expect(missing.map(([key, name]) => `${key} → ${name}`)).toEqual([]);
});

test("every registration template name exists as a built file", () => {
	const missing = [...siteTemplates.entries()].filter(
		([, name]) => !existsSync(path.join(builtTemplatesDir, name)),
	);
	expect(missing.map(([key, name]) => `${key} → html_templates/${name}`)).toEqual([]);
});

test("every registration template that is published locally is published under a real name", () => {
	if (!existsSync(publishedTemplatesDir)) return; // nothing mirrored in this checkout
	const missing = [...siteTemplates.entries()].filter(
		([, name]) => !existsSync(path.join(publishedTemplatesDir, name)),
	);
	expect(missing.map(([key, name]) => `${key} → bucket/latest/html_templates/${name}`)).toEqual([]);
});

test("the Β' Ετος Διπλώματος variant resolves to the byzantine file, not the plain one", () => {
	// The exact regression this file exists for.
	expect(siteTemplates.get("byzantineBDiploma")).toBe(
		"epitixis/epitixis_eggrafi_byzantine_b_diploma.html",
	);
	expect(siteTemplates.get("byzantineE")).toBe("epitixis/epitixis_eggrafi_byzantine_e.html");
});

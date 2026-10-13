/**
 * Guard against server code reaching the browser bundle (IMPROVEMENTS A1).
 *
 *   bun run build && bun run check:bundle          (or: bun scripts/checkClientBundle.ts <dir>)
 *
 * Scans every script under `dist/client` for markers that only server code carries — SQL, the
 * `cloudflare:workers` module, server-only env/binding names — and exits 1 if any shows up. The usual
 * cause is a client module (a Solid component, an Astro `<script>`) importing the route registry
 * (`@lib/api/routes`), `@hooks/useAPI.server` or `lib/utils.server.ts` instead of `@routes/index.client`
 * / `@hooks/apiCall`.
 */
import { Glob } from "bun";

const DIST = process.argv[2] ?? "dist/client";

const MARKERS: [label: string, pattern: RegExp][] = [
	["SQL", /\b(?:INSERT INTO|DELETE FROM|SELECT\s+[\w*,.()\s]+?\s+FROM)\s+\w+/],
	["cloudflare:workers", /cloudflare:workers/],
	...["GOOGLE_CLIENT_SECRET", "PDF_SERVICE_AUTH_TOKEN", "AUTOMATED_EMAILS_SERVICE_AUTH_TOKEN", "PUBLIC_LIMITER", "S3_BUCKET"].map(
		(name) => [`server env/binding ${name}`, new RegExp(`\\b${name}\\b`)] as [string, RegExp],
	),
];

const files = [...new Glob("**/*.{js,mjs}").scanSync({ cwd: DIST })];
if (files.length === 0) {
	console.error(`No scripts under ${DIST} — run \`bun run build\` first.`);
	process.exit(2);
}

let leaks = 0;
for (const file of files) {
	const code = await Bun.file(`${DIST}/${file}`).text();
	for (const [label, pattern] of MARKERS) {
		const match = pattern.exec(code);
		if (!match) continue;
		leaks++;
		const excerpt = code.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).replace(/\s+/g, " ");
		console.error(`✗ ${file}: ${label} — …${excerpt}…`);
	}
}

if (leaks) {
	console.error(
		`\n${leaks} server-only marker(s) in the client bundle. Browser code must import @routes/index.client / @hooks/apiCall, never the route registry.`,
	);
	process.exit(1);
}
console.log(`✓ ${files.length} client scripts, no server-only markers.`);

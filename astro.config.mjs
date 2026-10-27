import cloudflare from "@astrojs/cloudflare";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

// This checkout's own root. When the project runs from inside .claude/worktrees/<name>/, a "**/.claude/**" glob would match every file.
const root = fileURLToPath(new URL(".", import.meta.url));
const productionSite = "https://musicschool-metamorfosi.gr";
// Pages-specific branch/URL logic removed — the Worker is the single deploy target now.
const site = productionSite;

// https://astro.build/config
export default defineConfig({
	site,
	port: 3000,
	// No @astrojs/sitemap: the sitemaps are the dynamic routes src/pages/sitemap-*.xml.ts (docs/IMPROVEMENTS.md P7).
	// Trailing slashes are not configured here either: `trailingSlash` would also hit /api, the bucket catch-all and the
	// sitemaps, so the policy is an explicit rule in src/middleware.ts (lib/utilities/trailingSlash.ts).
	integrations: [solidJs()],
	adapter: cloudflare(),
	// Astro Sessions are not used (auth is cookie + D1 sys_users). Disabling
	// them stops @astrojs/cloudflare from auto-adding the SESSION KV binding.
	session: false,
	// The cross-site form POST check lives in src/middleware.ts: same rule, plus the one exemption
	// Sign in with Apple needs (its callback is a cross-site form POST).
	security: { checkOrigin: false },
	prefetch: {
		prefetchAll: false,
		defaultStrategy: "hover",
	},
	vite: {
		envPrefix: "VITE_",
		plugins: [tailwindcss()],
		server: {
			watch: {
				ignored: [
					"**/node_modules/**",
					"**/.git/**",
					"**/.vscode/**",
					"./schema.sql",
					"**/getData/**",
					"**/notAssets/**",
					"**/dist/**",
					"**/.wrangler/**",
					// Other agent sessions' git worktrees live here (this checkout's .claude only): their half-done edits must not reload this server.
					`${root}.claude/**`,
					"**/wrangler.jsonc",
					"**/services/**",
					"**/emailWorker/**",
					"**/bucket/**",
					"**/tests/**",
				],
			},
		},
		build: {
			cssMinify: true,
			minify: true,
		},
	},
});

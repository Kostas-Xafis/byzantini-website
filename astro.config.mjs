import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const unmappedRoutes = (page) => page.includes("admin") || page.includes("login") || page.includes("oauth2callback") || page.includes("unsubscribe");
// This checkout's own root. When the project runs from inside .claude/worktrees/<name>/, a "**/.claude/**" glob would match every file.
const root = fileURLToPath(new URL(".", import.meta.url));
const productionSite = "https://musicschool-metamorfosi.gr";
// Pages-specific branch/URL logic removed — the Worker is the single deploy target now.
const site = productionSite;

// https://astro.build/config
export default defineConfig({
	site,
	port: 3000,
	integrations: [
		solidJs(),
		sitemap({
			filter: (page) => !unmappedRoutes(page),
			changefreq: "weekly",
			priority: 1,
			lastmod: new Date(),
		}),
	],
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

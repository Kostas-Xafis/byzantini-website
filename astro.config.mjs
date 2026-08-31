import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import solidJs from "@astrojs/solid-js";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

const unmappedRoutes = (page) =>
	page.includes("admin") ||
	page.includes("login") ||
	page.includes("oauth2callback") ||
	page.includes("unsubscribe");
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
			priority: 0.8,
			lastmod: new Date(),
		}),
	],
	adapter: cloudflare(),
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
					"**/wrangler.jsonc",
					"**/dbSnapshots/**",
					"**/pdfWorker/**",
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

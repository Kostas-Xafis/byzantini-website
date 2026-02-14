import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import solidJs from "@astrojs/solid-js";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

const unmappedRoutes = (page) => page.includes("admin") || page.includes("login");
const productionSite = "https://musicschool-metamorfosi.gr";
const isMainBranch = process.env.CF_PAGES_BRANCH === "main";
const site = (isMainBranch && productionSite) || process.env.CF_PAGES_URL || productionSite;

// https://astro.build/config
export default defineConfig({
	site,
	integrations: [
		tailwind(),
		solidJs(),
		sitemap({
			filter: (page) => !unmappedRoutes(page),
			changefreq: "weekly",
			priority: 1,
			lastmod: new Date(),
		}),
	],
	output: "server",
	adapter: cloudflare({
		mode: "advanced",
	}),
	prefetch: {
		prefetchAll: false,
		defaultStrategy: "hover",
	},
	vite: {
		envPrefix: "VITE_",
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
					"**/wrangler.toml",
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

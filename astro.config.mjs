import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import solidJs from "@astrojs/solid-js";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

const unmappedRoutes = (page) => page.includes("admin") || page.includes("login");

// https://astro.build/config
export default defineConfig({
	site: "https://musicschool-metamorfosi.gr",
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
				],
			},
		},
		build: {
			cssMinify: true,
			minify: true,
		},
	},
});

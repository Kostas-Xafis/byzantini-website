import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import solidJs from "@astrojs/solid-js";
import prefetch from "@astrojs/prefetch";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

const unmappedRoutes = page => page.includes("admin");

// https://astro.build/config
export default defineConfig({
	site: "https://musicschool-metamorfosi.gr",
	integrations: [
		tailwind(),
		solidJs(),
		prefetch(),
		sitemap({
			filter: unmappedRoutes,
			changefreq: "weekly",
			priority: 1,
			lastmod: new Date()
		})
	],
	output: "server",
	adapter: cloudflare(),
	vite: {
		server: {
			watch: {
				ignored: [
					"**/node_modules/**",
					"**/.git/**",
					"**/.vscode/**",
					"./schema.sql",
					"**/getData/**",
					"**/lib/bucket/**",
					"**/notAssets/**"
				]
			}
		},
		build: {
			cssMinify: true,
			minify: true
		}
	}
});

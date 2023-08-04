import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import solidJs from "@astrojs/solid-js";
import prefetch from "@astrojs/prefetch";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel/serverless";
const unmappedRoutes = page => page.includes("admin");

// https://astro.build/config
export default defineConfig({
	site: "https://astrojs.org",
	integrations: [
		tailwind(),
		solidJs(),
		prefetch(),
		sitemap({
			filter: unmappedRoutes,
			changefreq: "monthly",
			priority: 1,
			lastmod: new Date()
		})
	],
	adapter: vercel(),
	output: "hybrid",
	vite: {
		server: {
			watch: {
				ignored: ["**/node_modules/**", "**/.git/**", "**/.vscode/**", "./schema.sql", "**/getData/**"]
			}
		}
	}
});

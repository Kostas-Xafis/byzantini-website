import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";

import solidJs from "@astrojs/solid-js";

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), solidJs()],
	output: "hybrid",
	adapter: node({
		mode: "standalone"
	}),
	vite: {
		server: {
			watch: {
				ignored: ["**/node_modules/**", "**/.git/**", "**/.vscode/**"]
			}
		}
	},
	experimental: {
		assets: true
	}
});

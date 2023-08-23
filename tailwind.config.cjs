/** @type {import('tailwindcss').Config} */

module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	theme: {
		extend: {
			fontFamily: {
				thomadaki: ["Thomadaki", "sans-serif"],
				anaktoria: ["Anaktoria", "sans-serif"],
				didact: ["Didact Gothic", "sans-serif"]
			},
			fontSize: {
				"2.5xl": "1.75rem"
			}
		}
	},
	plugins: [require("@tailwindcss/container-queries")]
};

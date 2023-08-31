/** @type {import('tailwindcss').Config} */

module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	theme: {
		extend: {
			fontFamily: {
				anaktoria: ["Anaktoria", "sans-serif"],
				didact: ["Didact Gothic", "sans-serif"]
			},
			fontSize: {
				"2.5xl": "1.75rem",
				"3.5xl": "2rem",
				"2xs": "0.625rem"
			},
			lineHeight: {
				"2xs": "0.75rem"
			},
			containers: {
				"2xs": "16rem",
				"3xs": "12rem"
			},
			screens: {
				xs: "480px",
				"2xs": "360px",
				"3xs": "320px"
			}
		}
	},
	plugins: [require("@tailwindcss/container-queries")]
};

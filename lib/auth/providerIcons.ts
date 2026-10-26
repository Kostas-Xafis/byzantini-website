/**
 * Brand marks of the sign-in providers as inline SVG (client-safe, static strings — used with
 * `set:html` in Astro and `innerHTML` in Solid). Google and Microsoft keep their brand colours; Apple's
 * mark is monochrome and follows `currentColor`, as Apple's guidelines ask.
 */
export const PROVIDER_ICONS: Record<string, string> = {
	google: `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`,
	apple: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.37 12.73c-.02-2.32 1.9-3.44 1.99-3.5-1.08-1.58-2.77-1.8-3.37-1.82-1.43-.15-2.8.84-3.53.84-.73 0-1.85-.82-3.04-.8-1.56.02-3.01.91-3.81 2.31-1.63 2.82-.42 7 1.17 9.29.78 1.12 1.7 2.38 2.91 2.33 1.17-.05 1.61-.75 3.02-.75 1.41 0 1.81.75 3.04.73 1.26-.02 2.05-1.14 2.82-2.27.89-1.3 1.25-2.56 1.27-2.63-.03-.01-2.44-.93-2.47-3.73zM14.05 5.92c.64-.78 1.08-1.86.96-2.94-.93.04-2.05.62-2.71 1.39-.6.69-1.12 1.79-.98 2.85 1.04.08 2.09-.53 2.73-1.3z"/></svg>`,
	microsoft: `<svg viewBox="0 0 23 23" width="20" height="20" aria-hidden="true" focusable="false"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M12 1h10v10H12z"/><path fill="#00A4EF" d="M1 12h10v10H1z"/><path fill="#FFB900" d="M12 12h10v10H12z"/></svg>`,
};

/**
 * The site's icon set — drawn for this project (it replaced Font Awesome).
 *
 * One source of truth, client-safe: `ICONS` maps a name to the inner markup of a 24×24 SVG. Every glyph is
 * drawn on the same grid with one stroke (`ICON_STROKE`), round caps and joins and `currentColor`, so an
 * icon takes the colour of its text; fills appear only where the glyph needs one (rating star, ornament
 * diamond, play, brand marks). The brand marks (Facebook, Instagram, YouTube) are the official Simple Icons
 * paths (CC0), scaled to the grid's 1.5-unit margin.
 *
 * Render with `<Icon name="…" />` — `src/components/other/Icon.solid.tsx` (Solid) or `Icon.astro` (Astro);
 * scripts that build DOM use `createIcon(...)`. Names are typed (`IconName`), so a typo fails the typecheck.
 * The base look (`.icon`: inline-block, 1em, text-like vertical alignment) is in `src/styles/global.css`.
 */

export const ICON_STROKE = 1.75;

/** A Simple Icons path (0–24 box), shrunk to the 1.5–22.5 area the drawn icons use. */
const brand = (d: string) => `<path fill="currentColor" stroke="none" transform="translate(1.5 1.5) scale(.875)" d="${d}"/>`;
/** Filled shape (keeps the stroke so its corners are rounded like the outlined glyphs). */
const solid = (d: string) => `<path fill="currentColor" d="${d}"/>`;

const FILE = `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>`;
const CLIPBOARD = `<path d="M8.5 4.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-1.5"/><rect x="8.5" y="2.5" width="7" height="4" rx="1"/>`;
const SQUARE = `<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>`;
const CIRCLE = `<circle cx="12" cy="12" r="9"/>`;
const SMALL_PERSON = `<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20c.7-3.3 3.3-5.5 6.5-5.5s5.8 2.2 6.5 5.5"/>`;

export const ICONS = {
	// ── People ──────────────────────────────────────────────────────────────
	user: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.9-3.6 3.9-6 7.5-6s6.6 2.4 7.5 6"/>`,
	users: `${SMALL_PERSON}<path d="M15.5 4.4a3.5 3.5 0 0 1 0 6.2"/><path d="M17.5 14.8c2.1.6 3.6 2.5 4 5.2"/>`,
	"user-plus": `${SMALL_PERSON}<path d="M19 8v6M16 11h6"/>`,
	"user-minus": `${SMALL_PERSON}<path d="M16 11h6"/>`,
	"user-tie": `<circle cx="12" cy="7" r="4"/><path d="M4.5 21c.6-3.8 3.6-6.5 7.5-6.5s6.9 2.7 7.5 6.5"/><path d="m12 14.5 1.2 1.6-1.2 4.4-1.2-4.4z"/>`,
	"user-shield": `<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20c.6-3.2 3.2-5.5 6.5-5.5 1.1 0 2.1.2 3 .7"/><path d="m18 12.5 3.5 1.3v2.7c0 2.4-1.5 4-3.5 4.8-2-.8-3.5-2.4-3.5-4.8v-2.7z"/>`,
	"users-gear": `<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20c.7-3.3 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5 1"/><circle cx="18" cy="17" r="2.6"/><path d="M18 12.6v1.8M18 19.6v1.8M13.6 17h1.8M20.6 17h1.8M14.9 13.9l1.25 1.25M19.85 18.85l1.25 1.25M14.9 20.1l1.25-1.25M19.85 15.15l1.25-1.25"/>`,
	"people-group": `<circle cx="12" cy="7.5" r="3"/><path d="M6.5 20c.5-3 2.8-5 5.5-5s5 2 5.5 5"/><circle cx="5" cy="9.5" r="2"/><circle cx="19" cy="9.5" r="2"/><path d="M1.5 18c.3-2 1.6-3.5 3.5-3.5M22.5 18c-.3-2-1.6-3.5-3.5-3.5"/>`,
	student: `<path d="M12 3 3 6.5l9 3.5 9-3.5z"/><path d="M7.5 8.3v2.2a4.5 4.5 0 0 0 9 0V8.3"/><path d="M4.5 21c.7-3.3 3.8-5.5 7.5-5.5s6.8 2.2 7.5 5.5"/><path d="M21 6.5V11"/>`,
	teacher: `<path d="M4 4h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-5.5"/><circle cx="7" cy="11.5" r="2.5"/><path d="M2.5 20.5c.4-2.6 2.2-4.5 4.5-4.5s4.1 1.9 4.5 4.5"/><path d="m10.5 13.5 5-4"/>`,
	gender: `<circle cx="10" cy="13" r="4.5"/><path d="M13.3 9.7 20 3M15.5 3H20v4.5M10 17.5V22M7.8 19.8h4.4"/>`,
	"id-card": `<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="2"/><path d="M5.5 15.5c.5-1.3 1.6-2 3-2s2.5.7 3 2M14 10h4.5M14 13.5h3"/>`,
	"address-book": `<rect x="5" y="3" width="14.5" height="18" rx="2"/><path d="M3 8h3.5M3 12h3.5M3 16h3.5"/><circle cx="12.5" cy="10" r="2.2"/><path d="M9 16.5c.5-1.6 1.9-2.5 3.5-2.5s3 .9 3.5 2.5"/>`,

	// ── Communication ───────────────────────────────────────────────────────
	mail: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>`,
	"mail-open": `<path d="M3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9"/><path d="m3 10 9-6.5 9 6.5"/><path d="m3.5 10.5 8.5 5.5 8.5-5.5"/><path d="M6.5 12.3V7h11v5.3M9.5 9.5h5"/>`,
	send: `<path d="M21 3 3 10.5l7 3 3 7.5z"/><path d="M21 3 10 13.5"/>`,
	phone: `<path d="M5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 7.5 7.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>`,
	smartphone: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
	laptop: `<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>`,
	monitor: `<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M9 21h6M12 16.5V21"/>`,
	megaphone: `<path d="M4 9.5v5a1 1 0 0 0 1 1h2.5l8 4.5V4l-8 4.5H5a1 1 0 0 0-1 1z"/><path d="m7.5 15.5 1.2 4.5"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5"/>`,
	newspaper: `<path d="M6.5 20.5h12a2 2 0 0 0 2-2v-14h-14v14a2 2 0 0 1-4 0V9h4"/><path d="M10 8h7M10 11.5h7M10 15h4.5"/>`,
	quote: `<circle cx="7" cy="9" r="2.5" fill="currentColor"/><path d="M9.5 9c0 4-1.5 6.5-4.5 8"/><circle cx="16" cy="9" r="2.5" fill="currentColor"/><path d="M18.5 9c0 4-1.5 6.5-4.5 8"/>`,
	microphone: `<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7"/>`,

	// ── Places ──────────────────────────────────────────────────────────────
	home: `<path d="M3.5 11 12 3.5l8.5 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/>`,
	"map-pin": `<path d="M12 21.5s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9.5" r="2.5"/>`,
	map: `<path d="M3 6.5 8.5 4.5l7 2.5 5.5-2v13l-5.5 2-7-2.5L3 19.5z"/><path d="M8.5 4.5v13M15.5 7v13"/>`,
	directions: `<path d="M10.6 3.1a2 2 0 0 1 2.8 0l7.5 7.5a2 2 0 0 1 0 2.8l-7.5 7.5a2 2 0 0 1-2.8 0l-7.5-7.5a2 2 0 0 1 0-2.8z"/><path d="M9.5 15v-2.5a1.5 1.5 0 0 1 1.5-1.5h4.5M13.5 9l2 2-2 2"/>`,
	city: `<path d="M4 21V5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V21"/><path d="M7 8h2M7 11.5h2M7 15h2"/><circle cx="17" cy="12.5" r="3.5"/><path d="M17 16v5M2.5 21h19"/>`,
	school: `<path d="M2.5 21h19"/><path d="M5 21V11l7-4 7 4v10"/><path d="M12 7V3h3"/><path d="M10 21v-4h4v4"/><circle cx="12" cy="12" r="1.5"/>`,
	church: `<path d="M12 2.5v4M10.5 4h3"/><path d="M8.5 12.5V10a3.5 3.5 0 0 1 7 0v2.5"/><path d="M4 21v-6.5l3-2h10l3 2V21"/><path d="M2.5 21h19"/><path d="M10 21v-2.5a2 2 0 0 1 4 0V21"/>`,
	shop: `<path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.83 2.83 0 0 0 5.67 0 2.83 2.83 0 0 0 5.66 0 2.83 2.83 0 0 0 5.67 0"/><path d="M5 12.3V20h14v-7.7"/><path d="M10 20v-4.5h4V20"/>`,
	truck: `<path d="M13 16.5v-11H3.5a1 1 0 0 0-1 1v10h2"/><path d="M13 8.5h4.3l3.7 4.2v4.8h-2"/><path d="M9 17.5h6"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>`,
	handshake: `<path d="M2.5 7.5 6 7l3.5 1.5"/><path d="M2.5 15H5l4.2 3.8a1.4 1.4 0 0 0 2-2"/><path d="m9.2 15.8 2.8 2.5a1.4 1.4 0 0 0 2-2l-.6-.6"/><path d="m11.9 13.9 2.9 2.6a1.4 1.4 0 0 0 2-2l-3.6-3.3"/><path d="M21.5 7.5h-3l-4.5-1.2-4.2 2.9-1.6 1.6a1.5 1.5 0 0 0 2 2.2l2.8-2.1 4.8 4.4h3.7"/>`,
	globe: `${CIRCLE}<path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>`,

	// ── School & music ──────────────────────────────────────────────────────
	"graduation-cap": `<path d="M12 4 2 9l10 5 10-5z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 9v6"/>`,
	certificate: `<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5"/>`,
	book: `<path d="M19 3H7.5A2.5 2.5 0 0 0 5 5.5v13"/><path d="M19 3v13.5H7.5a2.5 2.5 0 0 0 0 5H19v-5"/><path d="M9 7h6"/>`,
	feather: `<path d="M19.5 4.5C13 4.5 8 8.5 8 15v1.5h1.5c6.5 0 10-5 10-12z"/><path d="M4 20 15 9"/><path d="M8 14.5h5"/>`,
	scroll: `<path d="M7 17V5.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2h-4"/><path d="M17 5.5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V17h10v1.5a2 2 0 0 0 2 2"/><path d="M10.5 8.5h3M10.5 12h3"/>`,
	music: `<path d="M9 18V5.5l11-2.5v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>`,
	// Drawn upright (headstock at the top) and turned 45° so the headstock points top-right.
	guitar: `<g transform="rotate(45 12 12)"><path d="M12 10c2.4 0 3.7 1.5 3.7 3.4 0 1.5-1 2-1 2.9s2.1 1.5 2.1 3.7c0 2.6-2.2 4.4-4.8 4.4s-4.8-1.8-4.8-4.4c0-2.2 2.1-2.8 2.1-3.7s-1-1.4-1-2.9C8.3 11.5 9.6 10 12 10z"/><circle cx="12" cy="13.6" r="1.4"/><path d="M12 3.2V10M10.4 21.2h3.2"/><path d="M10.9 3.2 10.5-.6h3l-.4 3.8z"/></g>`,
	dove: `<path d="M21 8.5 18.8 7.6a2.6 2.6 0 0 0-4.6 1C14 13 11 16.2 6.5 16.6L3 19.5h7c5 0 8.5-3.5 8.5-8.5"/><path d="M14.3 9.6C10.8 9.6 6.8 7.6 5 3.5c-1 4 .2 8 4 10.3"/><path d="M17.2 8.2h.01"/>`,
	palette: `<path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="9.5" cy="7.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.2" r="1.2" fill="currentColor" stroke="none"/>`,

	// ── Money ───────────────────────────────────────────────────────────────
	euro: `<path d="M18.5 7.8a6.5 6.5 0 1 0 0 8.4"/><path d="M4.5 10h8.5M4.5 14h8.5"/>`,
	banknotes: `<rect x="2.5" y="5" width="16" height="11" rx="1.5"/><circle cx="10.5" cy="10.5" r="2.5"/><path d="M21.5 8v10a1.5 1.5 0 0 1-1.5 1.5H5.5"/>`,
	coins: `<ellipse cx="9" cy="6" rx="6" ry="2.5"/><path d="M3 6v8c0 1.4 2.7 2.5 6 2.5M3 10c0 1.4 2.7 2.5 6 2.5M15 6v3.5"/><ellipse cx="15" cy="13" rx="6" ry="2.5"/><path d="M9 13v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V13"/>`,
	"hand-coins": `<circle cx="14.5" cy="6" r="3"/><path d="M3 13.5h3l2.5-1h5a1.5 1.5 0 0 1 0 3h-3"/><path d="m13.5 15.5 4.8-2.4a1.5 1.5 0 0 1 1.7 2.4l-4.5 4H3"/>`,
	invoice: `${FILE}<path d="M15.1 12.4a3 3 0 1 0 0 4.2"/><path d="M9 13.6h4M9 15.6h4"/>`,

	// ── Files & content ─────────────────────────────────────────────────────
	"file-text": `${FILE}<path d="M8.5 9.5h2M8.5 13h7M8.5 16.5h7"/>`,
	"file-pdf": `${FILE}<g stroke-width="1.5"><path d="M7.5 18v-4.5h1.4a1.3 1.3 0 0 1 0 2.6H7.5"/><path d="M11.3 13.5V18h.7a2.25 2.25 0 0 0 0-4.5z"/><path d="M15.2 18v-4.5h2M15.2 15.7h1.6"/></g>`,
	"file-image": `${FILE}<circle cx="9.5" cy="11.5" r="1.25"/><path d="m7.5 18 3-3.5 2.2 2.3 1.3-1.3 2.5 2.5"/>`,
	"file-zip": `${FILE}<path d="M10 5h1M11 7h1M10 9h1M11 11h1"/><path d="M10 13.5h2v3h-2z"/>`,
	image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m3.5 17 5-5 4 4 2.5-2.5 5.5 5"/>`,
	images: `<rect x="6.5" y="3.5" width="14" height="11" rx="1.5"/><circle cx="11" cy="7.5" r="1.25"/><path d="m6.5 13 3.5-3 3 2.5 2.5-2 5 4"/><path d="M17.5 17.5v1a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 5 6.5h1.5"/>`,
	heading: `<path d="M6.5 4.5v15M17.5 4.5v15M6.5 12h11M4.5 4.5h4M15.5 4.5h4M4.5 19.5h4M15.5 19.5h4"/>`,
	paragraph: `<path d="M13 4.5v15M17.5 4.5v15M20 4.5h-10.5a4.5 4.5 0 0 0 0 9H13"/>`,
	hash: `<path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4 8.5h16.5M3.5 15.5H20"/>`,
	note: `<path d="M4.5 4.5h15v9l-6 6h-9z"/><path d="M19.5 13.5h-6v6"/>`,
	clipboard: CLIPBOARD,
	"clipboard-check": `${CLIPBOARD}<path d="m9 14 2 2 4-4"/>`,
	"clipboard-list": `${CLIPBOARD}<path d="M9 11.5h.01M12 11.5h3.5M9 15.5h.01M12 15.5h3.5"/>`,
	copy: `<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>`,
	calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14.5h.01M12 14.5h.01M16 14.5h.01"/>`,
	clock: `${CIRCLE}<path d="M12 7v5l3.5 2"/>`,
	history: `<path d="M3.5 12a8.5 8.5 0 1 0 2.49-6.01"/><path d="M6 2.5V6h3.5"/><path d="M12 8v4.5l3 2"/>`,
	database: `<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>`,
	table: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M10 9.5V20"/>`,
	code: `<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>`,
	briefcase: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>`,
	boxes: `<rect x="3" y="12.5" width="8.5" height="8" rx="1"/><rect x="12.5" y="12.5" width="8.5" height="8" rx="1"/><rect x="7.75" y="3.5" width="8.5" height="8" rx="1"/>`,

	// ── Actions ─────────────────────────────────────────────────────────────
	plus: `<path d="M12 5v14M5 12h14"/>`,
	close: `<path d="M6 6l12 12M18 6 6 18"/>`,
	check: `<path d="m4.5 12.5 5 5 10-11"/>`,
	"check-double": `<path d="m2 12.5 4.5 4.5L16 7"/><path d="m11.5 16 1 1L22 7"/>`,
	edit: `<path d="M11 4.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-5"/><path d="M17.5 3.5a1.9 1.9 0 0 1 2.7 2.7L12 14.5l-3.5.9.9-3.5z"/>`,
	pen: `<path d="m15.5 4.5 4 4-11 11-5 1 1-5z"/><path d="m13.5 6.5 4 4"/>`,
	trash: `<path d="M4 6.5h16M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="m6 6.5 1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13"/><path d="M10 10.5v6M14 10.5v6"/>`,
	search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>`,
	download: `<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>`,
	"cloud-download": `<path d="M7.5 17.5h-1a4 4 0 0 1-.5-7.97 6 6 0 0 1 11.6-1.5A4.5 4.5 0 0 1 17.5 17h-1"/><path d="M12 11v9M9 17l3 3 3-3"/>`,
	printer: `<path d="M7 9V3.5h10V9"/><path d="M7 17.5H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>`,
	undo: `<path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M6.3 2.8v3.5h3.5"/>`,
	link: `<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>`,
	"external-link": `<path d="M14 3.5h6.5V10M20.5 3.5 11 13"/><path d="M18 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10"/>`,
	"log-in": `<path d="M14.5 3.5H18a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.5"/><path d="M3 12h11.5M10.5 7.5 15 12l-4.5 4.5"/>`,
	"log-out": `<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M10 12h10.5M16.5 7.5 21 12l-4.5 4.5"/>`,
	lock: `<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3M12 15v2"/>`,
	key: `<circle cx="7.5" cy="16.5" r="4"/><path d="M10.5 13.5 20 4M16.5 7.5 19 10M14 10l2 2"/>`,
	eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`,
	settings: `<path d="M10.08 5.06V2.6h3.84v2.46A7.2 7.2 0 0 1 15.55 5.74L17.3 4 20 6.7l-1.74 1.75a7.2 7.2 0 0 1 .68 1.63h2.46v3.84h-2.46a7.2 7.2 0 0 1-.68 1.63L20 17.3 17.3 20l-1.75-1.74a7.2 7.2 0 0 1-1.63.68v2.46h-3.84v-2.46a7.2 7.2 0 0 1-1.63-.68L6.7 20 4 17.3l1.74-1.75a7.2 7.2 0 0 1-.68-1.63H2.6v-3.84h2.46a7.2 7.2 0 0 1 .68-1.63L4 6.7 6.7 4l1.75 1.74a7.2 7.2 0 0 1 1.63-.68z"/><circle cx="12" cy="12" r="2.75"/>`,
	play: solid("M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"),

	// ── Navigation ──────────────────────────────────────────────────────────
	menu: `<path d="M4 6.5h16M4 12h16M4 17.5h16"/>`,
	"chevron-right": `<path d="m9 5.5 6.5 6.5L9 18.5"/>`,
	"chevron-left": `<path d="M15 5.5 8.5 12l6.5 6.5"/>`,
	"chevron-up": `<path d="M5.5 15 12 8.5l6.5 6.5"/>`,
	"chevron-down": `<path d="m5.5 9 6.5 6.5L18.5 9"/>`,
	"chevrons-right": `<path d="m5.5 6 6 6-6 6M12.5 6l6 6-6 6"/>`,
	"chevron-circle-right": `${CIRCLE}<path d="m10.5 8 4 4-4 4"/>`,
	"arrow-right": `<path d="M4 12h16M13.5 5.5 20 12l-6.5 6.5"/>`,
	"arrow-left": `<path d="M20 12H4M10.5 5.5 4 12l6.5 6.5"/>`,
	"sort-numeric": `<path d="M7 20V4M3.5 7.5 7 4l3.5 3.5"/><circle cx="16.5" cy="6.5" r="2.3"/><path d="M18.8 6.5V8a3 3 0 0 1-3 3.2"/><path d="M15.5 14.5 17 13v7.5M15.5 20.5h3"/>`,

	// ── Status ──────────────────────────────────────────────────────────────
	info: `${CIRCLE}<path d="M12 11v5.5M12 7.75h.01"/>`,
	"alert-circle": `${CIRCLE}<path d="M12 7.5V13M12 16.25h.01"/>`,
	warning: `<path d="M10.3 4 2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>`,
	"check-circle": `${CIRCLE}<path d="m8 12.5 2.7 2.7L16 9.5"/>`,
	spinner: `<circle cx="12" cy="12" r="9" opacity=".25"/><path d="M12 3a9 9 0 0 1 9 9"/>`,
	star: solid("M12 3.2l2.53 6.12 6.6.51-5.04 4.3 1.55 6.44L12 17.1l-5.64 3.47 1.55-6.44-5.04-4.3 6.6-.51z"),
	diamond: solid("M12 2.5 21.5 12 12 21.5 2.5 12z"),
	asterisk: `<path d="M12 5v14M5.9 8.5l12.2 7M18.1 8.5 5.9 15.5"/>`,

	// ── Controls & theme ────────────────────────────────────────────────────
	checkbox: SQUARE,
	"checkbox-checked": `${SQUARE}<path d="m8 12.5 2.8 2.8L16.5 9"/>`,
	"square-plus": `${SQUARE}<path d="M12 8v8M8 12h8"/>`,
	"square-minus": `${SQUARE}<path d="M8 12h8"/>`,
	sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>`,
	moon: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>`,
	contrast: `${CIRCLE}<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>`,

	// ── Brands (Simple Icons, CC0) ──────────────────────────────────────────
	facebook: brand(
		"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
	),
	instagram: brand(
		"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
	),
	youtube: brand(
		"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
	),
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconOptions {
	/** Extra classes (size via `text-*`/`size-*`, colour via `text-*`, `animate-spin`, …). */
	class?: string;
	/** Accessible name; without it the icon is decorative (`aria-hidden`). */
	title?: string;
	/** Width and height; default `1em` (scales with the font size like a glyph). */
	size?: number | string;
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The `<svg>` attributes every icon shares — used by both components and `iconSvg`. */
export function iconAttributes(opts: IconOptions = {}): Record<string, string> {
	const size = opts.size === undefined ? "1em" : String(opts.size);
	const attrs: Record<string, string> = {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 24 24",
		width: size,
		height: size,
		fill: "none",
		stroke: "currentColor",
		"stroke-width": String(ICON_STROKE),
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		class: opts.class ? `icon ${opts.class}` : "icon",
	};
	if (opts.title) attrs.role = "img";
	else attrs["aria-hidden"] = "true";
	return attrs;
}

/** Inner markup of an icon, with its `<title>` first when it has one. */
export function iconContent(name: IconName, title?: string): string {
	return (title ? `<title>${escapeText(title)}</title>` : "") + ICONS[name];
}

/** The whole `<svg>` as a string (for `set:html` / `innerHTML`). */
export function iconSvg(name: IconName, opts: IconOptions = {}): string {
	const attrs = Object.entries(iconAttributes(opts))
		.map(([k, v]) => `${k}="${escapeText(v)}"`)
		.join(" ");
	return `<svg ${attrs}>${iconContent(name, opts.title)}</svg>`;
}

/** An icon element, for scripts that build DOM by hand. */
export function createIcon(name: IconName, opts: IconOptions = {}): SVGSVGElement {
	const tpl = document.createElement("template");
	tpl.innerHTML = iconSvg(name, opts);
	return tpl.content.firstElementChild as SVGSVGElement;
}

/**
 * Design tokens for the React Email templates.
 *
 * One place to tune the school's email look: brand colors, typography,
 * spacing and radii. Components in render/parts/ and render/emails/ should
 * read from here instead of hardcoding values, so a palette change (or a
 * future seasonal variant) propagates everywhere.
 */

export const COLORS = {
	/** Primary brand red (school logo / accents / primary buttons). */
	brand: "#9c1006",
	/** Deeper red for hover-ish and secondary accents. */
	brandDark: "#7d0d05",
	/** Soft brand tint used as callout backgrounds. */
	brandTint: "#fdf1eb",
	/** Border color for brand-tinted callouts. */
	brandTintBorder: "#ecd3c8",

	/** Star rating / celebratory gold. */
	gold: "#e8a400",
	/** Soft gold tint (callout background). */
	goldTint: "#fff8e1",
	/** Border for gold-tinted callouts. */
	goldTintBorder: "#e6c860",

	/** Positive / success (confirmation banners). */
	success: "#1e7a45",
	/** Soft success tint (confirmation banner background). */
	successTint: "#eaf5ee",
	/** Border for success-tinted callouts. */
	successTintBorder: "#cfe6d8",

	/** Main body text. */
	text: "#222222",
	/** Secondary text (signature, captions). */
	textMuted: "#555555",
	/** Tertiary text (meta, unsubscribe). */
	textSubtle: "#888888",
	/** Smallest print. */
	textFaint: "#999999",

	/** Page backdrop behind the email card. */
	bg: "#f6f2ec",
	/** Email card background. */
	card: "#ffffff",
	/** Hairline borders and dividers. */
	border: "#e8e2d9",
} as const;

/** Safely neutral font stack; Greek glyphs are available in the fallbacks. */
export const FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', Tahoma, sans-serif";

/**
 * Shared inline styles. Objects rather than string templates so they merge
 * cleanly into React style props and stay email-safe when rendered.
 */
export const TYPO = {
	/** Main body copy used by MailText. */
	body: {
		fontFamily: FONT_FAMILY,
		fontSize: 18,
		lineHeight: 1.6,
		color: COLORS.text,
	},
	/** Secondary copy (signature, captions, footers). */
	small: {
		fontFamily: FONT_FAMILY,
		fontSize: 13,
		lineHeight: 1.6,
		color: COLORS.textMuted,
	},
	/** Muted meta copy. */
	tiny: {
		fontFamily: FONT_FAMILY,
		fontSize: 12,
		lineHeight: 1.5,
		color: COLORS.textSubtle,
	},
} as const;

export const RADII = {
	card: 8,
	box: 8,
	button: 6,
	pill: 999,
} as const;

export const SPACING = {
	cardPaddingX: 28,
	cardPaddingY: 24,
	section: 20,
	paragraph: 16,
} as const;

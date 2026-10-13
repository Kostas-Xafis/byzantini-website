import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { SCHOOL_CONTACT } from "../schoolContact";
import { Badge } from "./Badge";
import { COLORS, FONT_FAMILY, RADII, SPACING, TYPO } from "../theme";
import { SchoolSignature } from "./SchoolSignature";
import { UnsubscribeFooter } from "./UnsubscribeFooter";

/** @deprecated Use COLORS.brand from ../theme. Kept for backward compatibility. */
export const BRAND_RED = COLORS.brand;

/**
 * Default inbox preview (preheader) text — the school name, so an email with
 * no explicit preview still shows something meaningful instead of raw HTML.
 */
const DEFAULT_PREVIEW = `${SCHOOL_CONTACT.name} — ${SCHOOL_CONTACT.church}`;

export function MailText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
	return <Text style={{ ...TYPO.body, ...style }}>{children}</Text>;
}

export type EmailLayoutProps = {
	children: ReactNode;
	/**
	 * Preheader text shown in the inbox preview next to the subject.
	 * Defaults to the school name + church.
	 */
	preview?: string;
	/** Optional pill badge rendered under the header (e.g. "Σχολικό Έτος 2026-2027"). */
	badge?: ReactNode;
	/** Literal unsubscribe token placeholder (e.g. "{{token}}") or a real token. Omit to render no unsubscribe footer. */
	token?: string;
};

/**
 * Shared email chrome: full HTML document, white card with a brand-red top
 * edge over a light backdrop, branded header (title + optional badge),
 * school signature and the unsubscribe footer.
 */
export function EmailLayout({ children, preview, badge, token }: EmailLayoutProps) {
	return (
		<Html lang="el">
			<Head />
			<Preview>{preview?.trim() || DEFAULT_PREVIEW}</Preview>
			<Body style={{ margin: 0, padding: 0, backgroundColor: COLORS.bg }}>
				<Container style={{ maxWidth: 600, margin: "0 auto", padding: "24px 12px" }}>
					<Section
						style={{
							backgroundColor: COLORS.card,
							borderRadius: RADII.card,
							padding: `${SPACING.cardPaddingY}px ${SPACING.cardPaddingX}px`,
							border: `1px solid ${COLORS.border}`,
							borderTop: `4px solid ${COLORS.brand}`,
						}}>
						<Text
							style={{
								margin: "0 0 2px",
								fontFamily: FONT_FAMILY,
								fontSize: 16,
								fontWeight: 700,
								lineHeight: 1.4,
								color: COLORS.brand,
							}}>
							{SCHOOL_CONTACT.name}
						</Text>
						<Text
							style={{
								margin: "0 0 14px",
								fontFamily: FONT_FAMILY,
								fontSize: 13.5,
								fontWeight: 500,
								lineHeight: 1.5,
								color: COLORS.textMuted,
							}}>
							{SCHOOL_CONTACT.church}
						</Text>
						{badge && (
							<Badge style={{ margin: "0 0 14px" }}>{badge}</Badge>
						)}
						<Hr style={{ margin: "0 0 22px", borderColor: COLORS.border }} />
						{children}
						<SchoolSignature />
						{token && <UnsubscribeFooter token={token} />}
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

import type { ReactNode } from "react";
import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { COLORS, FONT_FAMILY, RADII } from "../theme";

export type HighlightTone = "brand" | "gold" | "success" | "neutral";

const toneStyles: Record<HighlightTone, { backgroundColor: string; border: string; accent: string; titleColor: string }> = {
	brand: { backgroundColor: COLORS.brandTint, border: COLORS.brandTintBorder, accent: COLORS.brand, titleColor: COLORS.brand },
	gold: { backgroundColor: COLORS.goldTint, border: COLORS.goldTintBorder, accent: COLORS.gold, titleColor: "#7a5c00" },
	success: {
		backgroundColor: COLORS.successTint,
		border: COLORS.successTintBorder,
		accent: COLORS.success,
		titleColor: COLORS.success,
	},
	neutral: { backgroundColor: COLORS.bg, border: COLORS.border, accent: COLORS.border, titleColor: COLORS.text },
};

export type HighlightBoxProps = {
	children: ReactNode;
	/** Optional bold heading rendered above the children (an emoji icon may prefix it). */
	title?: string;
	/** Visual style; "brand" matches the classic red callout, "gold" for ratings, "success" for confirmations. */
	tone?: HighlightTone;
	style?: CSSProperties;
};

/**
 * Generic callout box: soft tinted card with a colored accent edge, used for
 * highlights, reminders and key information. Replaces the per-email
 * highlightBoxStyle copies, so one adjustment retunes every email.
 */
export function HighlightBox({ children, title, tone = "brand", style }: HighlightBoxProps) {
	const t = toneStyles[tone];
	return (
		<Section
			style={{
				backgroundColor: t.backgroundColor,
				border: `1px solid ${t.border}`,
				borderLeft: `4px solid ${t.accent}`,
				borderRadius: RADII.box,
				padding: "16px 20px",
				margin: "8px 0 18px",
				...style,
			}}>
			{title && (
				<Text
					style={{
						margin: "0 0 10px",
						fontFamily: FONT_FAMILY,
						fontSize: 15,
						fontWeight: 700,
						lineHeight: 1.4,
						letterSpacing: 0.2,
						textTransform: "uppercase",
						color: t.titleColor,
					}}>
					{title}
				</Text>
			)}
			{children}
		</Section>
	);
}

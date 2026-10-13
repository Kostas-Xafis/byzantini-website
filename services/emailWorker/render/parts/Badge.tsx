import type { CSSProperties, ReactNode } from "react";
import { Text } from "@react-email/components";
import { COLORS, FONT_FAMILY, RADII } from "../theme";

export type BadgeTone = "brand" | "gold" | "neutral";

const toneStyles: Record<BadgeTone, { backgroundColor: string; color: string }> = {
	brand: { backgroundColor: COLORS.brandTint, color: COLORS.brand },
	gold: { backgroundColor: COLORS.goldTint, color: "#7a5c00" },
	neutral: { backgroundColor: COLORS.bg, color: COLORS.textMuted },
};

export type BadgeProps = {
	children: ReactNode;
	tone?: BadgeTone;
	style?: CSSProperties;
};

/**
 * Small pill label for season / year announcements (e.g. "Σχολικό Έτος
 * 2026-2027" or "Εγγραφές ανοιχτές"). Rendered as inline text so it stays
 * weightless in the header block.
 */
export function Badge({ children, tone = "brand", style }: BadgeProps) {
	return (
		<Text
			style={{
				display: "inline-block",
				margin: 0,
				fontFamily: FONT_FAMILY,
				fontSize: 11.5,
				fontWeight: 700,
				letterSpacing: 0.6,
				textTransform: "uppercase",
				lineHeight: 1.4,
				padding: "5px 12px",
				borderRadius: RADII.pill,
				...toneStyles[tone],
				...style,
			}}>
			{children}
		</Text>
	);
}

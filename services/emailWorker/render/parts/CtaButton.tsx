import type { ReactNode, CSSProperties } from "react";
import { Button } from "@react-email/components";
import { COLORS, FONT_FAMILY, RADII } from "../theme";

export type CtaButtonVariant = "primary" | "outline";

export type CtaButtonProps = {
	href: string;
	children: ReactNode;
	/** "primary" (solid brand) by default; "outline" for secondary actions. */
	variant?: CtaButtonVariant;
};

const baseStyle = {
	borderRadius: RADII.button,
	fontFamily: FONT_FAMILY,
	fontSize: 16,
	fontWeight: 700,
	textDecoration: "none",
	display: "inline-block",
} as const;

const variantStyles: Record<CtaButtonVariant, CSSProperties> = {
	primary: {
		backgroundColor: COLORS.brand,
		color: "#ffffff",
		padding: "13px 30px",
	},
	outline: {
		backgroundColor: "#ffffff",
		color: COLORS.brand,
		border: `2px solid ${COLORS.brand}`,
		padding: "11px 28px",
	},
};

/**
 * Primary (solid) or secondary (outline) call-to-action styled as a button
 * with email-safe inline styles.
 */
export function CtaButton({ href, children, variant = "primary" }: CtaButtonProps) {
	return (
		<Button href={href} style={{ ...baseStyle, ...variantStyles[variant] }}>
			{children}
		</Button>
	);
}

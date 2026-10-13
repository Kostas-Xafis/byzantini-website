import type { ReactNode } from "react";
import { Link, Text } from "@react-email/components";
import { COLORS, FONT_FAMILY } from "../theme";

export type ContactRow = {
	/** Leading glyph (e.g. 📞 / 📧 / 🌐). */
	icon: string;
	/** Label rendered after the icon (e.g. "Τηλ.:"). */
	label?: string;
	/** Visible text (may be a ReactNode for rich content). */
	text: ReactNode;
	/** Optional href; when set the text becomes a link. */
	href?: string;
};

export type ContactCardProps = {
	/** Bold heading above the rows (e.g. "Γραμματεία Σχολής"). */
	title?: string;
	rows: ContactRow[];
	/** Auto-link helpers: when `href` is omitted the row is a plain line. */
};

const linkStyle = {
	color: COLORS.brand,
	fontWeight: 700,
	textDecoration: "none",
} as const;

/**
 * Structured contact block: one row per way of reaching the school
 * (phone, email, website…), consistent across all emails that offer contact
 * details. Place inside (or in place of) a HighlightBox.
 */
export function ContactCard({ title, rows }: ContactCardProps) {
	return (
		<table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
			<tbody>
				{title && (
					<tr>
						<td colSpan={2} style={{ padding: "0 0 8px" }}>
							<Text
								style={{
									margin: 0,
									fontFamily: FONT_FAMILY,
									fontSize: 15,
									fontWeight: 700,
									lineHeight: 1.4,
									letterSpacing: 0.2,
									textTransform: "uppercase",
									color: COLORS.brand,
								}}>
								{title}
							</Text>
						</td>
					</tr>
				)}
				{rows.map((row, index) => (
					<tr key={index}>
						<td
							valign="top"
							style={{
								width: 34,
								padding: "0 6px 0 0",
								fontFamily: FONT_FAMILY,
								fontSize: 15,
								lineHeight: 1.7,
								color: COLORS.brand,
							}}>
							{row.icon}
						</td>
						<td
							valign="top"
							style={{
								fontFamily: FONT_FAMILY,
								fontSize: 16,
								lineHeight: 1.7,
								color: COLORS.text,
								padding: "0 0 2px",
							}}>
							{row.label ? <span style={{ color: COLORS.textMuted }}>{row.label} </span> : null}
							{row.href ? (
								<Link href={row.href} style={linkStyle}>
									{row.text}
								</Link>
							) : (
								row.text
							)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

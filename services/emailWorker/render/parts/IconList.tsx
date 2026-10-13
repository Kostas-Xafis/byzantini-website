import type { ReactNode } from "react";
import { COLORS, FONT_FAMILY, TYPO } from "../theme";

export type IconListItem = {
	/** Optional leading glyph (emoji or short symbol). */
	icon?: string;
	/** Optional: bold leaf with minor emphasis. */
	text: ReactNode;
};

export type IconListProps = {
	items: (IconListItem | string)[];
	/** Default marker for items without their own `icon`. */
	icon?: string;
	/** Marker column width (px). */
	iconWidth?: number;
	/** Font size of the item text. */
	fontSize?: number;
};

/**
 * Email-safe list with custom markers: each item is a table row with a fixed
 * icon column, instead of relying on <ul> list markers that Gmail and Outlook
 * render inconsistently. Use for department lists, checklists, reminders.
 */
export function IconList({ items, icon: defaultIcon, iconWidth = 30, fontSize = 18 }: IconListProps) {
	return (
		<table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
			<tbody>
				{items.map((item, index) => {
					const { icon, text } = typeof item === "string" ? { icon: defaultIcon, text: item } : item;
					return (
						<tr key={index}>
							<td
								valign="top"
								style={{
									width: iconWidth,
									padding: "5px 4px 5px 0",
									fontFamily: FONT_FAMILY,
									fontSize: fontSize,
									lineHeight: 1.6,
									color: COLORS.brand,
								}}>
								{icon ?? "•"}
							</td>
							<td valign="top" style={{ padding: "5px 0" }}>
								<div
									style={{
										...TYPO.body,
										fontSize,
										margin: 0,
									}}>
									{text}
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

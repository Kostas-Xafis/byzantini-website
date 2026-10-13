import { Img, Link } from "@react-email/components";
import { COLORS, FONT_FAMILY } from "../theme";

export type CenteredImageProps = {
	src: string;
	alt?: string;
	/** Display width in px; height scales proportionally. */
	width?: number;
	/**
	 * When set, the whole image links here (e.g. the poster's website/bucket
	 * URL) and a small "open at full resolution" link is shown beneath — so
	 * recipients whose client blocks images can still reach the poster.
	 */
	href?: string;
};

/**
 * Centered, email-safe image (table-wrapper + inline styles, like the classic
 * poster blocks in the old templates). Scales down on narrow clients.
 */
export function CenteredImage({ src, alt = "", width = 400, href }: CenteredImageProps) {
	const image = (
		<Img
			src={src}
			alt={alt}
			width={width}
			style={{
				width: width,
				maxWidth: "100%",
				height: "auto",
				display: "block",
				margin: "0 auto",
				borderRadius: 8,
			}}
		/>
	);
	return (
		<table align="center" role="presentation" border={0} cellPadding={0} cellSpacing={0} width="100%">
			<tbody>
				<tr>
					<td align="center" style={{ padding: "16px 0" }}>
						{href ? <Link href={href}>{image}</Link> : image}
						{href && (
							<p
								style={{
									margin: "10px 0 0",
									fontFamily: FONT_FAMILY,
									fontSize: 13.5,
									color: COLORS.textMuted,
								}}>
								<Link href={href} style={{ color: COLORS.brand, textDecoration: "none", fontWeight: 600 }}>
									Δείτε την ανακοίνωση σε πλήρη ανάλυση
								</Link>
							</p>
						)}
					</td>
				</tr>
			</tbody>
		</table>
	);
}

import { Link, Text } from "@react-email/components";
import { SCHOOL_CONTACT, siteHref } from "../schoolContact";
import { COLORS, FONT_FAMILY } from "../theme";

export type UnsubscribeFooterProps = {
	/** Literal token placeholder (e.g. "{{token}}") or a real token. */
	token: string;
};

/**
 * Muted, centered unsubscribe block. Small and unobtrusive so it never
 * competes with the content, but always reachable by recipients who want out.
 */
export function UnsubscribeFooter({ token }: UnsubscribeFooterProps) {
	const href = siteHref(`${SCHOOL_CONTACT.paths.unsubscribe}?token=${token}`);
	return (
		<>
			<Text
				style={{
					margin: "30px 0 0",
					textAlign: "center",
					fontFamily: FONT_FAMILY,
					fontSize: 13,
					color: COLORS.textSubtle,
				}}>
				<Link href={href} style={{ color: COLORS.textSubtle, textDecoration: "none" }}>
					Απεγγραφή / Unsubscribe
				</Link>
			</Text>
			<Text
				style={{
					margin: "6px 16px 0",
					textAlign: "center",
					fontFamily: FONT_FAMILY,
					fontSize: 11.5,
					lineHeight: 1.5,
					color: COLORS.textFaint,
				}}>
				Αν δεν επιθυμείτε να λαμβάνετε ενημερωτικά email από τη Σχολή μας, πατήστε τον παραπάνω σύνδεσμο.
			</Text>
		</>
	);
}

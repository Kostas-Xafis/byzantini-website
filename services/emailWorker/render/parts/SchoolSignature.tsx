import { Column, Hr, Img, Link, Row, Text } from "@react-email/components";
import { mailHref, SCHOOL_CONTACT, siteHref } from "../schoolContact";
import { COLORS, FONT_FAMILY, TYPO } from "../theme";

/**
 * School signature footer: logo, contact details and social links, shared by
 * every template. Content and layout mirror the classic footer — only the
 * typography is centralized on the theme tokens.
 */
export function SchoolSignature() {
	const contactStyle = {
		...TYPO.small,
		margin: "0 0 10px",
		lineHeight: 1.75,
	} as const;

	return (
		<>
			<Hr style={{ margin: "28px 0 20px", borderColor: COLORS.border }} />
			<Row>
				<Column width={76} valign="top">
					<Img
						src={SCHOOL_CONTACT.website.logoUrl}
						width={64}
						height={64}
						alt="Σχολή Βυζαντινής &amp; Παραδοσιακής Μουσικής"
					/>
				</Column>
				<Column style={{ paddingLeft: 14, paddingRight: 4 }}>
					<Text style={contactStyle}>
						<b style={{ color: COLORS.brand, fontSize: 14 }}>{SCHOOL_CONTACT.name}</b>
						<br />
						{SCHOOL_CONTACT.church}
						<br />
						{SCHOOL_CONTACT.address}
					</Text>
					<Text style={contactStyle}>
						e:{" "}
						<Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)} style={{ color: COLORS.brand, textDecoration: "none" }}>
							{SCHOOL_CONTACT.emails.secretariat}
						</Link>
						{" · "}
						w:{" "}
						<Link href={siteHref()} style={{ color: COLORS.brand, textDecoration: "none" }}>
							{SCHOOL_CONTACT.website.host}
						</Link>
						<br />
						τ: {SCHOOL_CONTACT.phones.secretariat}
						{" · "}
						{SCHOOL_CONTACT.phones.landline}
					</Text>
					<Text
						style={{
							...contactStyle,
							margin: "0",
							fontSize: 12,
							letterSpacing: 0.4,
						}}>
						<Link href={SCHOOL_CONTACT.socials.facebook} style={{ color: COLORS.textSubtle, textDecoration: "none" }}>
							Facebook
						</Link>
						{" · "}
						<Link href={SCHOOL_CONTACT.socials.youtube} style={{ color: COLORS.textSubtle, textDecoration: "none" }}>
							YouTube
						</Link>
						{" · "}
						<Link href={SCHOOL_CONTACT.socials.instagram} style={{ color: COLORS.textSubtle, textDecoration: "none" }}>
							Instagram
						</Link>
						{" · "}
						<Link href={SCHOOL_CONTACT.socials.viber} style={{ color: COLORS.textSubtle, textDecoration: "none" }}>
							Viber
						</Link>
					</Text>
				</Column>
			</Row>
		</>
	);
}

import { Link, Section, Text } from "@react-email/components";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { COLORS, FONT_FAMILY } from "../theme";

export type InterestDeclarationProps = {
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	/** The family's question, or "—". Rendered with its line breaks (pre-wrap). */
	message: string;
	/** Where the form was filled in («Αρχική σελίδα», «Σελίδα επικοινωνίας»). */
	page: string;
	date: string;
	/** The admin page «Δηλώσεις ενδιαφέροντος». */
	admin_url: string;
};

const labelStyle = { margin: "0 0 2px", fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted } as const;
const valueStyle = { margin: "0 0 12px", fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.text } as const;
const linkStyle = { color: COLORS.brand, fontWeight: 700, wordBreak: "break-all" } as const;

/**
 * «Δήλωση Ενδιαφέροντος» — sent to the secretariat for every declaration the site's public form receives
 * (site: `InterestDeclarations.post`). The site sets the family's address as reply-to, so «Απάντηση» writes to them.
 */
export function InterestDeclaration({ first_name, last_name, email, phone, message, page, date, admin_url }: InterestDeclarationProps) {
	return (
		<EmailLayout preview={`Νέα δήλωση ενδιαφέροντος από ${first_name} ${last_name}`} badge="Δήλωση Ενδιαφέροντος">
			<MailText>Μια νέα δήλωση ενδιαφέροντος καταχωρήθηκε στην ιστοσελίδα.</MailText>
			<Section style={{ margin: "0 0 8px" }}>
				<Text style={labelStyle}>Ονοματεπώνυμο</Text>
				<Text style={valueStyle}>
					{first_name} {last_name}
				</Text>
				<Text style={labelStyle}>Email</Text>
				<Text style={valueStyle}>
					<Link href={`mailto:${email}`} style={linkStyle}>
						{email}
					</Link>
				</Text>
				<Text style={labelStyle}>Τηλέφωνο</Text>
				<Text style={valueStyle}>
					<Link href={`tel:${phone}`} style={linkStyle}>
						{phone}
					</Link>
				</Text>
			</Section>
			<HighlightBox title="Μήνυμα" tone="neutral">
				<Text style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 16, lineHeight: 1.6, color: COLORS.text }}>
					{/* pre-wrap on the span only: the pretty-printed whitespace around it must not show. */}
					<span style={{ whiteSpace: "pre-wrap" }}>{message}</span>
				</Text>
			</HighlightBox>
			<MailText style={{ fontSize: 14, color: COLORS.textMuted }}>
				{date} · {page}
			</MailText>
			<MailText>Απαντώντας σε αυτό το email, η απάντησή σας πηγαίνει απευθείας στον ενδιαφερόμενο.</MailText>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={admin_url}>Όλες οι δηλώσεις</CtaButton>
			</MailText>
		</EmailLayout>
	);
}

import { Link, Text } from "@react-email/components";
import { CtaButton } from "../parts/CtaButton";
import { CenteredImage } from "../parts/CenteredImage";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { POSTER_URL } from "../assets";
import { mailHref, SCHOOL_CONTACT, siteHref, telHref } from "../schoolContact";
import { COLORS, FONT_FAMILY } from "../theme";

export type UpenthimisiEggrafisProps = {
	/** Literal placeholder (e.g. "{{token}}") or a real unsubscribe token. */
	token: string;
	/** Literal placeholder (e.g. "{{regid}}") or a real registration_url. */
	regid: string;
	/** Literal placeholder (e.g. "{{am}}") or a real Α.Μ. */
	am: string;
	/** Literal placeholder (e.g. "{{first_name}}") or a real first name. */
	first_name: string;
	/** Literal placeholder (e.g. "{{last_name}}") or a real last name. */
	last_name: string;
};

const WELCOME_YEAR = "2026-2027";

const linkStyle = {
	color: COLORS.brand,
	fontWeight: "bold",
	textDecoration: "none",
} as const;

/**
 * Υπενθύμιση εγγραφής — renewal reminder for students of the previous school
 * year. Per-recipient values (token/regid/am/names) are emitted as
 * {{placeholders}} so the compiled HTML keeps working with the existing
 * applyToTemplate() substitution pipeline.
 */
export function UpenthimisiEggrafis({
	token,
	regid,
	am,
	first_name,
	last_name,
}: UpenthimisiEggrafisProps) {
	const regidUrl = siteHref(`${SCHOOL_CONTACT.paths.registrations}?regid=${regid}`);
	return (
		<EmailLayout
			token={token}
			preview={`Εγγραφές ${WELCOME_YEAR} — συμπληρώστε την αίτηση εγγραφής με τον προσωπικό σας σύνδεσμο.`}
			badge={`Σχολικό Έτος ${WELCOME_YEAR}`}>
			<MailText>Αγαπητοί σπουδαστές,</MailText>
			<MailText>
				Με ιδιαίτερη χαρά σάς ενημερώνουμε για την έναρξη των εγγραφών στη{" "}
				<b>Σχολή Βυζαντινής και Παραδοσιακής Μουσικής</b> του Ιερού Ναού Μεταμορφώσεως του
				Σωτήρος Δήμου Μεταμόρφωσης για το νέο σχολικό έτος {WELCOME_YEAR}.
			</MailText>
			<MailText>
				Η εγγραφή σας πραγματοποιείται μέσω της επίσημης ιστοσελίδας της Σχολής μας,{" "}
				<Link href={siteHref()} style={linkStyle}>
					{SCHOOL_CONTACT.website.host}
				</Link>
				.
			</MailText>
			<HighlightBox title="Τα προσωπικά σας στοιχεία">
				<Text style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 17, lineHeight: 1.6, color: COLORS.text }}>
					🎓 Σπουδαστής/-στρια: <b>{`{{first_name}} {{last_name}}`}</b>
				</Text>
				<Text style={{ margin: "8px 0 0", fontFamily: FONT_FAMILY, fontSize: 17, lineHeight: 1.6, color: COLORS.text }}>
					🪪 Αριθμός Μητρώου (Α.Μ.): <b>{`{{am}}`}</b>
				</Text>
				<Text style={{ margin: "10px 0 0", fontFamily: FONT_FAMILY, fontSize: 15, lineHeight: 1.55, color: COLORS.textMuted }}>
					Παρακαλείστε να συμπληρώσετε τα παραπάνω στοιχεία στην ηλεκτρονική αίτηση εγγραφής.
				</Text>
			</HighlightBox>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={regidUrl}>Συμπληρώστε την αίτηση εγγραφής</CtaButton>
			</MailText>
			<MailText>Για το έτος φοίτησης παρακαλείστε να συμβουλευτείτε:</MailText>
			<IconList
				items={[
					{ icon: "📖", text: "Το βιβλιάριό σας" },
					{ icon: "🎼", text: "Τον καθηγητή σας" },
					{ icon: "🗂️", text: "Τη Γραμματεία της Σχολής" },
				]}
			/>
			<MailText>
				Για οποιαδήποτε πληροφορία ή απορία σχετικά με τα μαθήματα, τα τμήματα, τις ώρες
				διδασκαλίας κ.λπ., μπορείτε να επικοινωνείτε με τη Γραμματεία της Σχολής στο{" "}
				<Link href={telHref(SCHOOL_CONTACT.phones.secretariat)} style={linkStyle}>
					{SCHOOL_CONTACT.phones.secretariat}
				</Link>{" "}
				ή αποστείλετε email στο{" "}
				<Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)} style={linkStyle}>
					{SCHOOL_CONTACT.emails.secretariat}
				</Link>{" "}
				και{" "}
				<Link href={mailHref(SCHOOL_CONTACT.emails.byzantine)} style={linkStyle}>
					{SCHOOL_CONTACT.emails.byzantine}
				</Link>
				.
			</MailText>
			<MailText>
				Για τα παραδοσιακά όργανα και το τραγούδι στο τηλ.{" "}
				{SCHOOL_CONTACT.phones.traditional.map((number, index) => (
					<span key={number}>
						{index > 0 && " & "}
						<Link href={telHref(number)} style={linkStyle}>
							{number}
						</Link>
					</span>
				))}
				.
			</MailText>
			<CenteredImage src={POSTER_URL} alt="Ανακοίνωση Έναρξης Μαθημάτων 2026" width={420} href={POSTER_URL} />
			<MailText>Ευχόμαστε σε όλους μια δημιουργική και επιτυχημένη μουσική χρονιά!</MailText>
		</EmailLayout>
	);
}

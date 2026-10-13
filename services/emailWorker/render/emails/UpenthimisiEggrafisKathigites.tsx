import { Link } from "@react-email/components";
import { CenteredImage } from "../parts/CenteredImage";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { POSTER_URL } from "../assets";
import { mailHref, SCHOOL_CONTACT, siteHref, telHref } from "../schoolContact";
import { COLORS } from "../theme";

export type UpenthimisiEggrafisKathigitesProps = {
	/**
	 * Literal placeholder (e.g. "{{greeting}}") or a real per-teacher greeting
	 * ("Αγαπητέ συνάδελφε," / "Αγαπητή συναδέλφισσα," — computed from gender).
	 */
	greeting: string;
};

const REGISTRATION_YEAR = "2026-2027";
const REGISTRATION_WINDOW = "1 Σεπτεμβρίου – 30 Οκτωβρίου 2026";

const linkStyle = {
	color: COLORS.brand,
	fontWeight: "bold",
	textDecoration: "none",
} as const;

/**
 * Υπενθύμιση εγγραφών προς καθηγητές — asks each teacher to remind their
 * students to complete the online registration for the new school year.
 * No unsubscribe footer: teachers are staff, not mailing-list subscribers
 * (only some have email_subscriptions rows). The poster is embedded and
 * attached by the campaign runner, like the other 2026 campaigns.
 */
export function UpenthimisiEggrafisKathigites({ greeting }: UpenthimisiEggrafisKathigitesProps) {
	return (
		<EmailLayout
			preview={`Εγγραφές ${REGISTRATION_YEAR}: ${REGISTRATION_WINDOW} — παρακαλούμε να ενθαρρύνετε τους σπουδαστές σας να ολοκληρώσουν την εγγραφή.`}
			badge={`Σχολικό Έτος ${REGISTRATION_YEAR}`}>
			<MailText>{greeting}</MailText>
			<MailText>Καλή, ευλογημένη και καρποφόρα σχολική χρονιά! 🎶</MailText>
			<MailText>
				Οι εγγραφές για το νέο σχολικό έτος <b>{REGISTRATION_YEAR}</b> έχουν ήδη ξεκινήσει (1η
				Σεπτεμβρίου) και θα διαρκέσουν έως την <b>Παρασκευή 30 Οκτωβρίου 2026</b>.
			</MailText>
			<MailText>
				Κάθε σπουδαστής λαμβάνει ατομικό e-mail με τον προσωπικό του σύνδεσμο εγγραφής. Ωστόσο,
				η δική σας υπενθύμιση — μέσα στο μάθημα ή με ένα σύντομο μήνυμα — είναι καθοριστική:
				παρακαλούμε να ενθαρρύνετε τους σπουδαστές σας να ολοκληρώσουν{" "}
				<b>έγκαιρα την ηλεκτρονική τους εγγραφή</b>.
			</MailText>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={siteHref(SCHOOL_CONTACT.paths.registrations)}>Σελίδα Εγγραφών</CtaButton>
			</MailText>
			<MailText>
				Η εγγραφή πραγματοποιείται αποκλειστικά μέσω της επίσημης ιστοσελίδας της Σχολής μας,{" "}
				<Link href={siteHref()} style={linkStyle}>
					{SCHOOL_CONTACT.website.host}
				</Link>
				.
			</MailText>
			<HighlightBox title="Υπενθυμίσεις προς τους σπουδαστές">
				<IconList
					fontSize={16}
					items={[
						{
							text: (
								<>
									Εγγραφές {REGISTRATION_YEAR}: <b>{REGISTRATION_WINDOW}</b> (ηλεκτρονικά).
								</>
							),
						},
						{
							text: (
								<>
									Απαραίτητη προϋπόθεση για την ολοκλήρωση της εγγραφής είναι η τακτοποίηση
									της ετήσιας συνδρομής <b>πριν από την έναρξη των μαθημάτων</b>.
								</>
							),
						},
						{
							text: (
								<>
									Κάθε σπουδαστής θα λάβει ατομικό e-mail για το πρόγραμμα και τη
									λειτουργία της Γραμματείας.
								</>
							),
						},
					]}
				/>
			</HighlightBox>
			<MailText>
				Για οποιαδήποτε απορία ή διευκρίνιση, μπορείτε να επικοινωνείτε με τη Γραμματεία της
				Σχολής: 📞{" "}
				<Link href={telHref(SCHOOL_CONTACT.phones.secretariat)} style={linkStyle}>
					{SCHOOL_CONTACT.phones.secretariat}
				</Link>{" "}
				· 📧{" "}
				<Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)} style={linkStyle}>
					{SCHOOL_CONTACT.emails.secretariat}
				</Link>
			</MailText>
			<CenteredImage src={POSTER_URL} alt="Ανακοίνωση Έναρξης Μαθημάτων 2026" width={420} href={POSTER_URL} />
			<MailText>
				Σας ευχαριστούμε θερμά για τη συνεργασία και την αφοσίωσή σας στο έργο της Σχολής μας.
			</MailText>
			<MailText>Ευχόμαστε σε όλους μια δημιουργική και ευλογημένη μουσική χρονιά! 🙏🎼</MailText>
		</EmailLayout>
	);
}

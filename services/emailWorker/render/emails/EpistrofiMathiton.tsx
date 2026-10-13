import { CenteredImage } from "../parts/CenteredImage";
import { ContactCard } from "../parts/ContactCard";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { POSTER_URL } from "../assets";
import { mailHref, SCHOOL_CONTACT, siteHref, telHref } from "../schoolContact";

export type EpistrofiMathitonProps = {
	/** Literal placeholder (e.g. "{{token}}") or a real unsubscribe token. */
	token: string;
};

const WELCOME_YEAR = "2026-2027";

/**
 * Επιστροφή παλαιών μαθητών — invitation to former students to re-enroll for
 * the new school year. The poster is embedded as an image AND attached by the
 * campaign runner, exactly like the renewal campaign.
 */
export function EpistrofiMathiton({ token }: EpistrofiMathitonProps) {
	return (
		<EmailLayout
			token={token}
			preview={`Η Σχολή ανοίγει και πάλι τις πόρτες της — επανεγγραφές για το σχολικό έτος ${WELCOME_YEAR}.`}
			badge={`Σχολικό Έτος ${WELCOME_YEAR}`}>
			<MailText>Αγαπητοί μας μαθητές,</MailText>
			<MailText>Χαίρετε!</MailText>
			<MailText>
				Με την έναρξη του νέου εκκλησιαστικού έτους και της νέας σχολικής χρονιάς, η{" "}
				<b>Σχολή Βυζαντινής και Παραδοσιακής Μουσικής</b>, με έδρα το Πνευματικό Κέντρο του
				Ιερού Ναού Μεταμορφώσεως του Σωτήρος στη Μεταμόρφωση, ανοίγει και πάλι τις πόρτες της.
			</MailText>
			<MailText>
				Με ιδιαίτερη χαρά επικοινωνούμε μαζί σας, ιδιαίτερα με όσους υπήρξατε μαθητές της
				Σχολής μας στο παρελθόν.
			</MailText>
			<MailText>
				Ίσως κάποια στιγμή χρειάστηκε να διακόψετε τις σπουδές σας λόγω προσωπικών,
				οικογενειακών ή επαγγελματικών υποχρεώσεων. Ίσως ολοκληρώσατε έναν σημαντικό κύκλο
				σπουδών, όπως στη Βυζαντινή Μουσική, και τώρα αισθάνεστε την ανάγκη να συνεχίσετε τη
				μουσική σας πορεία.
			</MailText>
			<MailText>Όποιος κι αν ήταν ο λόγος, η πόρτα της Σχολής μας παραμένει ανοιχτή για εσάς. 🎶</MailText>
			<MailText>
				Η νέα χρονιά μπορεί να γίνει η ευκαιρία για ένα νέο ξεκίνημα ή για τη συνέχιση μιας
				πορείας που ίσως έμεινε στη μέση.
			</MailText>
			<MailText>Μπορείτε να συνεχίσετε ή να ξεκινήσετε σπουδές σε:</MailText>
			<HighlightBox tone="brand">
				<IconList
					fontSize={17}
					items={[
						{ icon: "🕊️", text: <b>Βυζαντινή Μουσική</b> },
						{ icon: "🎻", text: <b>Παραδοσιακά Όργανα</b> },
						{ icon: "🎤", text: <b>Παραδοσιακό Τραγούδι</b> },
						{ icon: "🎙️", text: <b>Φωνητική &amp; Ορθοφωνία</b> },
					]}
				/>
			</HighlightBox>
			<MailText>Οι εγγραφές για τη νέα σχολική χρονιά έχουν ήδη ξεκινήσει.</MailText>
			<MailText>
				📩 Θα χαρούμε να επικοινωνήσετε μαζί μας, ακόμη και αν έχουν περάσει χρόνια από την
				τελευταία σας παρουσία στη Σχολή, ώστε να συζητήσουμε μαζί σας τις δυνατότητες
				επανεγγραφής και συνέχισης των σπουδών σας.
			</MailText>
			<MailText>
				Για πληροφορίες σχετικά με τα μαθήματα, τα τμήματα, το πρόγραμμα και τις εγγραφές
				μπορείτε να απευθύνεστε στη Γραμματεία της Σχολής:
			</MailText>
			<HighlightBox>
				<ContactCard
					rows={[
						{ icon: "📞", label: "Τηλ.:", text: SCHOOL_CONTACT.phones.secretariat, href: telHref(SCHOOL_CONTACT.phones.secretariat) },
						{ icon: "📧", label: "Email:", text: SCHOOL_CONTACT.emails.secretariat, href: mailHref(SCHOOL_CONTACT.emails.secretariat) },
						{ icon: "📧", label: "Βυζαντινή Μουσική:", text: SCHOOL_CONTACT.emails.byzantine, href: mailHref(SCHOOL_CONTACT.emails.byzantine) },
						{
							icon: "🌐",
							label: "Ιστοσελίδα:",
							text: SCHOOL_CONTACT.website.host,
							href: siteHref(),
						},
					]}
				/>
			</HighlightBox>
			<CenteredImage src={POSTER_URL} alt="Ανακοίνωση Έναρξης Μαθημάτων 2026" width={420} href={POSTER_URL} />
			<MailText>
				🎶 Η μουσική γνώση που αποκτήσατε δεν χάνεται.
				<br />
				Η αγάπη για τη μουσική μπορεί πάντα να γίνει η αφορμή για ένα νέο ξεκίνημα.
			</MailText>
			<MailText>Σας περιμένουμε και πάλι κοντά μας!</MailText>
			<MailText>Καλή και δημιουργική μουσική χρονιά! 🙏🎼</MailText>
		</EmailLayout>
	);
}

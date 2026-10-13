import { Hr, Text } from "@react-email/components";
import { EVENT_IMAGE_URL } from "../assets";
import { CenteredImage } from "../parts/CenteredImage";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { COLORS, FONT_FAMILY } from "../theme";

export type AgiasmosAponomiProps = {
	/** Literal placeholder (e.g. "{{token}}") or a real unsubscribe token. */
	token: string;
};

const SCHOOL_YEAR = "2026–2027";

/**
 * Πρόσκληση στην εκδήλωση έναρξης της σχολικής χρονιάς 2026–2027: Αγιασμός,
 * απονομή πτυχίων και διπλωμάτων, και μουσικό πρόγραμμα. Το φυλλάδιο της
 * εκδήλωσης επισυνάπτεται από τον campaign runner (`getAttachments`), οπότε
 * το σώμα του email παραμένει αναγνώσιμο και όταν τα συνημμένα δεν ανοίγουν.
 */
export function AgiasmosAponomi({ token }: AgiasmosAponomiProps) {
	return (
		<EmailLayout
			token={token}
			preview={`Αγιασμός & Απονομή Πτυχίων — Κυριακή 27 Σεπτεμβρίου 2026, 18:00, Κεντρική Πλατεία Μεταμόρφωσης.`}
			badge={`Σχολικό Έτος ${SCHOOL_YEAR}`}>
			<MailText>Αγαπητοί μαθητές,</MailText>
			<MailText>
				η <b>Σχολή Βυζαντινής και Παραδοσιακής Μουσικής</b> σας προσκαλεί στην εκδήλωση
				για την έναρξη της νέας σχολικής χρονιάς {SCHOOL_YEAR}, η οποία θα
				πραγματοποιηθεί:
			</MailText>
			<HighlightBox tone="brand">
				<IconList
					items={[
						{ icon: "📅", text: <b>Κυριακή 27 Σεπτεμβρίου 2026</b> },
						{ icon: "🕕", text: <b>Ώρα 18:00</b> },
						{ icon: "📍", text: <>Κεντρική Πλατεία Μεταμόρφωσης</> },
					]}
				/>
			</HighlightBox>
			<MailText>
				Η εκδήλωση θα ξεκινήσει με τον <b>Αγιασμό</b> για τη νέα σχολική χρονιά, υπό του
				Σεβασμιωτάτου Μητροπολίτου μας κ. Κυρίλλου.
			</MailText>
			<MailText>
				Στη συνέχεια θα πραγματοποιηθεί η <b>Επίδοση Πτυχίων και Διπλωμάτων</b> Βυζαντινής
				και Παραδοσιακής Μουσικής στους επιτυχόντες της προηγούμενης σχολικής χρονιάς.
			</MailText>
			<HighlightBox tone="gold">
				<IconList
					fontSize={17}
					items={[
						{
							icon: "🎓",
							text: (
								<>
									<b>Ιδιαίτερη παράκληση προς όλους τους μαθητές</b> που πρόκειται να λάβουν
									πτυχίο ή δίπλωμα: η παρουσία σας στην απονομή είναι απαραίτητη, καθώς
									πρόκειται για μια σημαντική στιγμή της μαθητικής σας πορείας και της Σχολής
									μας.
								</>
							),
						},
					]}
				/>
			</HighlightBox>
			<MailText>
				Η βραδιά θα ολοκληρωθεί με ένα όμορφο <b>μουσικό πρόγραμμα</b> με παραδοσιακά
				τραγούδια και μουσικά σύνολα από διάφορες περιοχές του Ελληνισμού, με τη συμμετοχή
				των πτυχιούχων της Σχολής μας και πολιτιστικών συλλόγων.
			</MailText>
			<CenteredImage
				src={EVENT_IMAGE_URL}
				alt="Ανακοίνωση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων"
				width={420}
				href={EVENT_IMAGE_URL}
			/>
			<MailText>
				🎶 <b>Σας περιμένουμε όλους!</b>
			</MailText>
			<MailText>
				Η παρουσία σας θα μας δώσει ιδιαίτερη χαρά και θα τιμήσει τη Σχολή, τους εκπαιδευτικούς
				και τους μαθητές της.
			</MailText>
			<MailText style={{ color: COLORS.textMuted, fontSize: 15 }}>
				📎 Στο συνημμένο αρχείο θα βρείτε την ανακοίνωση της εκδήλωσης.
			</MailText>
			<Hr style={{ margin: "22px 0 16px", borderColor: COLORS.border }} />
			<Text
				style={{
					margin: 0,
					textAlign: "right",
					fontFamily: FONT_FAMILY,
					fontSize: 14,
					fontWeight: 700,
					letterSpacing: 0.4,
					color: COLORS.textMuted,
				}}>
				ΕΚ ΤΗΣ ΓΡΑΜΜΑΤΕΙΑΣ ΤΗΣ ΣΧΟΛΗΣ
			</Text>
		</EmailLayout>
	);
}

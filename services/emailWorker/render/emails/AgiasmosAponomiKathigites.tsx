import { Hr, Text } from "@react-email/components";
import { EVENT_IMAGE_URL } from "../assets";
import { CenteredImage } from "../parts/CenteredImage";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { COLORS, FONT_FAMILY } from "../theme";

const SCHOOL_YEAR = "2026–2027";

/**
 * Πρόσκληση στην εκδήλωση έναρξης της σχολικής χρονιάς 2026–2027, προς τους
 * καθηγητές της Σχολής: Αγιασμός, απονομή πτυχίων και διπλωμάτων, μουσικό
 * πρόγραμμα — με το αίτημα να ενημερώσουν έγκαιρα τους μαθητές των τμημάτων
 * τους. Το φυλλάδιο της εκδήλωσης επισυνάπτεται από τον campaign runner
 * (`getAttachments`).
 *
 * Χωρίς footer απεγγραφής: οι καθηγητές είναι προσωπικό της Σχολής, όχι
 * συνδρομητές της λίστας ενημέρωσης (βλ. UpenthimisiEggrafisKathigites).
 */
export function AgiasmosAponomiKathigites() {
	return (
		<EmailLayout
			preview={`Αγιασμός & Απονομή Πτυχίων — Κυριακή 27 Σεπτεμβρίου 2026, 18:00 — παρακαλούμε ενημερώστε έγκαιρα τους μαθητές σας.`}
			badge={`Σχολικό Έτος ${SCHOOL_YEAR}`}>
			<MailText>Αγαπητοί Καθηγητές,</MailText>
			<MailText>
				Σας αποστέλλουμε την πρόσκληση για την εκδήλωση της Σχολής μας, η οποία θα
				πραγματοποιηθεί την <b>Κυριακή 27 Σεπτεμβρίου 2026, στις 18:00</b>, στην Κεντρική
				Πλατεία Μεταμόρφωσης.
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
			<HighlightBox tone="brand">
				<IconList
					fontSize={17}
					items={[
						{
							icon: "📣",
							text: (
								<>
									<b>Παρακαλούμε θερμά</b> να ενημερώσετε εγκαίρως τους μαθητές των τμημάτων
									σας και να τους παροτρύνετε να παρευρεθούν.
								</>
							),
						},
					]}
				/>
			</HighlightBox>
			<MailText>
				Η εκδήλωση θα ξεκινήσει με τον <b>Αγιασμό</b> για την έναρξη της νέας σχολικής χρονιάς{" "}
				{SCHOOL_YEAR}, υπό του Σεβασμιωτάτου Μητροπολίτου μας κ. Κυρίλλου.
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
									<b>Ιδιαίτερα παρακαλούμε</b> να ενημερώσετε <b>προσωπικά</b> τους μαθητές
									που πρόκειται να λάβουν πτυχίο ή δίπλωμα, ώστε να γνωρίζουν ότι η παρουσία
									τους στην απονομή είναι <b>απαραίτητη</b> και να μην υπάρξουν απουσίες.
								</>
							),
						},
					]}
				/>
			</HighlightBox>
			<MailText>
				Η εκδήλωση θα ολοκληρωθεί με <b>μουσικό πρόγραμμα</b> με παραδοσιακά τραγούδια και
				μουσικά σύνολα από διάφορες περιοχές του Ελληνισμού, με τη συμμετοχή των πτυχιούχων
				της Σχολής μας και πολιτιστικών συλλόγων.
			</MailText>
			<CenteredImage
				src={EVENT_IMAGE_URL}
				alt="Ανακοίνωση Εκδήλωσης – Αγιασμός & Απονομή Πτυχίων"
				width={420}
				href={EVENT_IMAGE_URL}
			/>
			<MailText>
				Η παρουσία όλων των μαθητών και των καθηγητών θα αποτελέσει ιδιαίτερη χαρά και τιμή
				για τη Σχολή μας.
			</MailText>
			<MailText>
				Σας ευχαριστούμε θερμά για τη συνεργασία και, κυρίως, για τη φροντίδα ώστε η
				ενημέρωση να φτάσει σε όλους τους μαθητές.
			</MailText>
			<MailText style={{ color: COLORS.textMuted, fontSize: 15 }}>
				📎 Στο συνημμένο αρχείο θα βρείτε την πρόσκληση της εκδήλωσης.
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
				ΕΚ ΤΗΣ ΓΡΑΜΜΑΤΕΙΑΣ
			</Text>
		</EmailLayout>
	);
}

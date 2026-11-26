import { Hr, Text } from "@react-email/components";
import { SEMINAR_ANNOUNCEMENT_URL, SEMINAR_POSTER_URL } from "../assets";
import { CenteredImage } from "../parts/CenteredImage";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { IconList } from "../parts/IconList";
import { COLORS, FONT_FAMILY } from "../theme";

export type SeminarioVyzantinisProps = {
	/** Literal placeholder (e.g. "{{token}}") or a real unsubscribe token. */
	token: string;
};

/**
 * Πρόσκληση στο Σεμινάριο Βυζαντινής Μουσικής της Τετάρτης 2 Δεκεμβρίου 2026 (εισηγητής ο Άρχων Διδάσκαλος
 * κ. Δημήτριος Νεραντζής). Το κείμενο είναι της Διεύθυνσης· η αφίσα (ίδια με την κεντρική φωτογραφία της
 * ανακοίνωσης στον ιστότοπο) εμφανίζεται μέσα στο email και επισυνάπτεται από τον campaign runner.
 */
export function SeminarioVyzantinis({ token }: SeminarioVyzantinisProps) {
	return (
		<EmailLayout
			token={token}
			preview="Σεμινάριο Βυζαντινής Μουσικής με τον Άρχοντα Διδάσκαλο κ. Δημήτριο Νεραντζή — Τετάρτη 2 Δεκεμβρίου 2026, 19:00."
			badge="Σεμινάριο Βυζαντινής Μουσικής">
			<MailText>Αγαπητοί σπουδαστές και αγαπητές σπουδάστριες,</MailText>
			<MailText>
				η <b>Σχολή Βυζαντινής και Παραδοσιακής Μουσικής</b> του Ιερού Ναού Μεταμορφώσεως του Σωτήρος σάς προσκαλεί σε ένα ξεχωριστό{" "}
				<b>Σεμινάριο Βυζαντινής Μουσικής</b> με θέμα:
			</MailText>
			<Text
				style={{
					margin: "4px 0 18px",
					textAlign: "center",
					fontFamily: FONT_FAMILY,
					fontSize: 20,
					lineHeight: 1.45,
					fontWeight: 700,
					color: COLORS.brand,
				}}>
				«Η Μεταρρύθμιση των Τριών Διδασκάλων και οι κατηργημένοι χαρακτήρες: Ιστορική εξέλιξη και σύγχρονη πράξη»
			</Text>
			<MailText>
				με εισηγητή τον Άρχοντα Διδάσκαλο του Αποστόλου της Μεγάλης του Χριστού Εκκλησίας, <b>κ. Δημήτριο Νεραντζή</b>.
			</MailText>
			<HighlightBox tone="brand">
				<IconList
					items={[
						{ icon: "📅", text: <b>Τετάρτη 2 Δεκεμβρίου 2026</b> },
						{ icon: "🕖", text: <b>Ώρα 19:00</b> },
						{
							icon: "📍",
							text: <>Πνευματικό, Πολιτιστικό και Συνεδριακό Κέντρο του Ιερού Ναού Μεταμορφώσεως του Σωτήρος (Χλόης & Οδυσσέως, Μεταμόρφωση)</>,
						},
					]}
				/>
			</HighlightBox>
			<MailText>
				Πρόκειται για μια ιδιαίτερη εκπαιδευτική ευκαιρία εμβάθυνσης στην ιστορία της βυζαντινής μουσικής σημειογραφίας και στη σχέση της παλαιάς με τη
				σύγχρονη ψαλτική πράξη.
			</MailText>
			<HighlightBox tone="gold">
				<IconList
					fontSize={17}
					items={[
						{
							icon: "🎟️",
							text: (
								<>
									Η <b>συμβολική συμμετοχή</b> στο σεμινάριο είναι <b>5€</b>.
								</>
							),
						},
						{
							icon: "📜",
							text: (
								<>
									Θα δοθούν <b>βεβαιώσεις παρακολούθησης</b> σε όλους τους συμμετέχοντες.
								</>
							),
						},
						{
							icon: "💻",
							text: (
								<>
									Για όσους δεν έχουν τη δυνατότητα φυσικής παρουσίας θα υπάρχει <b>απευθείας διαδικτυακή μετάδοση</b>, με αποστολή σχετικού
									συνδέσμου.
								</>
							),
						},
					]}
				/>
			</HighlightBox>
			<CenteredImage
				src={SEMINAR_POSTER_URL}
				alt="Αφίσα — Σεμινάριο Βυζαντινής Μουσικής, Τετάρτη 2 Δεκεμβρίου 2026"
				width={420}
				href={SEMINAR_POSTER_URL}
			/>
			<MailText>Η παρουσία και η συμμετοχή όλων σας θα μας τιμήσει ιδιαίτερα.</MailText>
			<div style={{ textAlign: "center", margin: "8px 0 20px" }}>
				<CtaButton href={SEMINAR_ANNOUNCEMENT_URL} variant="outline">
					Η ανακοίνωση στον ιστότοπο
				</CtaButton>
			</div>
			<MailText style={{ color: COLORS.textMuted, fontSize: 15 }}>📎 Στο συνημμένο αρχείο θα βρείτε την αφίσα του σεμιναρίου.</MailText>
			<Hr style={{ margin: "22px 0 16px", borderColor: COLORS.border }} />
			<Text style={{ margin: "0 0 4px", textAlign: "right", fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.textMuted }}>Με εκτίμηση,</Text>
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
				Η Διεύθυνση της Σχολής Βυζαντινής και Παραδοσιακής Μουσικής
			</Text>
		</EmailLayout>
	);
}

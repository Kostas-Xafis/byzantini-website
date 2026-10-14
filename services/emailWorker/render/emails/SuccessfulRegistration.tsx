import { Fragment } from "react";
import { Link, Text } from "@react-email/components";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { mailHref, SCHOOL_CONTACT, telHref } from "../schoolContact";
import { COLORS, FONT_FAMILY, TYPO } from "../theme";

/**
 * Επιτυχής εγγραφή — transactional confirmation sent after a student submits
 * the registration form (no unsubscribe link; not a marketing email).
 * Content mirrors the original epitixis_eggrafi.html.
 *
 * The email is broken down by the student's class level: only the numbered
 * group (and bullet) that applies to the student's department / year is
 * rendered, so students who do not belong to any specific level are not asked
 * for supporting documents (see html_templates/note.txt).
 */
export type SuccessfulRegistrationLevel =
	| "byzantine_e"
	| "byzantine_b_diploma"
	| "byzantine_default"
	| "traditional_b_anotera"
	| "traditional_b_diploma"
	| "traditional_default"
	| "default";

export type SuccessfulRegistrationProps = {
	/** Class level of the student; determines which bullet group is rendered. */
	level?: SuccessfulRegistrationLevel;
	/** Placeholder "{{class_year}}" or the registration's full year level (e.g. "Β' Ετος Διπλώματος"). */
	classYear?: string;
	/** Placeholder "{{class_type}}" or the numeric class type (0|1|2). */
	classType?: string;
	/** Placeholder "{{registration_year}}" or the school year (e.g. "2026-2027"). */
	schoolYear?: string;
};

const linkStyle = {
	color: COLORS.brand,
	fontWeight: "bold",
} as const;

const infoRowStyle = {
	margin: "2px 0",
	fontFamily: FONT_FAMILY,
	fontSize: 16,
	lineHeight: 1.6,
	color: COLORS.text,
} as const;

export function SuccessfulRegistration({ level = "default", classYear, classType, schoolYear }: SuccessfulRegistrationProps) {
	const type = level.startsWith("byzantine") ? "byzantine" : "traditional";
	return (
		<EmailLayout preview="Η ηλεκτρονική αίτησή σας υποβλήθηκε επιτυχώς — ολοκληρώστε την εγγραφή σας στη Γραμματεία.">
			<HighlightBox tone="success" style={{ textAlign: "center" }} title="✅ Η αίτησή σας υποβλήθηκε επιτυχώς">
				<Text
					style={{
						margin: 0,
						fontFamily: FONT_FAMILY,
						fontSize: 16,
						lineHeight: 1.6,
						color: COLORS.text,
					}}>
					Για την ολοκλήρωση της <b>ΕΓΓΡΑΦΗΣ</b> σας και πριν από την έναρξη των μαθημάτων,
					παρακαλούμε για τα εξής:
				</Text>
			</HighlightBox>

			{(classYear || classType || schoolYear) && (
				<HighlightBox
					tone="neutral"
					title="Πληροφορίες εγγραφής"
					style={{ margin: "8px 0 20px", borderLeft: `4px solid ${COLORS.brand}` }}>
					<Text style={infoRowStyle}>
						<span style={{ color: COLORS.textMuted }}>Τμήμα:</span> <b>{classType}</b>
					</Text>
					<Text style={infoRowStyle}>
						<span style={{ color: COLORS.textMuted }}>Έτος φοίτησης:</span> <b>{classYear}</b>
					</Text>
					<Text style={infoRowStyle}>
						<span style={{ color: COLORS.textMuted }}>Σχολικό έτος:</span> <b>{schoolYear}</b>
					</Text>
				</HighlightBox>
			)}

			<MailText style={{ fontWeight: 700 }}>Οι σπουδαστές:</MailText>
			<ul style={{ ...mailListStyle }}>
				<li>
					Να προσέρχεσθε στη Γραμματεία της Σχολής κάθε <b>Τρίτη 5 – 9 μ.μ.</b> για την <u>ολοκλήρωση της εγγραφής σας</u>. Οι
					παλαιοί μαθητές οφείλουν να έχουν μαζί τους το ΒΙΒΛΙΑΡΙΟ ΣΠΟΥΔΑΣΤΗ.
				</li>
				<li>
					Απαραίτητη προϋπόθεση για την ολοκλήρωση της εγγραφής αποτελεί η τακτοποίηση της ετήσιας συνδρομής σας προς τη Σχολή, η
					οποία εξαρτάται από τα τυχόν επιπλέον μαθήματα που θα παρακολουθήσετε παράλληλα, π.χ. Βυζαντινή Μουσική, όργανα,
					φωνητική κ.λπ.{" "}
					<b>
						Παρακαλούμε, ενημερωθείτε από τη Γραμματεία για τον προσδιορισμό της συνδρομής σας, πριν έλθετε για την ολοκλήρωση
						της εγγραφής σας.
					</b>
				</li>
			</ul>

			{level === "byzantine_e" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Οι σπουδαστές Βυζαντινής Μουσικής:</MailText>
					<ul style={{ ...mailListStyle }}>
						<li>
							Οι <b>σπουδαστές του Ε΄ Έτους</b>, να αποστείλετε <u>άμεσα</u> στο email της Γραμματείας (
							<Link href={mailHref(SCHOOL_CONTACT.emails.byzantine)} style={linkStyle}>
								{SCHOOL_CONTACT.emails.byzantine}
							</Link>
							), αντίγραφο Αστυνομικής Ταυτότητας ή Διαβατηρίου, αντίγραφο Απολυτηρίου Λυκείου και Υπεύθυνη Δήλωση επικυρωμένη
							από το <Link href="https://gov.gr" style={linkStyle}>gov.gr</Link> ή ΚΕΠ με το εξής περιεχόμενο: Προς το ΥΠ.ΠΟ. Δηλώνω υπεύθυνα
							ότι <u>δεν</u> είμαι κάτοχος Πτυχίου Βυζαντινής Μουσικής.
						</li>
					</ul>
				</>
			)}

			{level === "byzantine_b_diploma" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Οι σπουδαστές Βυζαντινής Μουσικής:</MailText>
					<ul style={{ ...mailListStyle }}>
						<li>
							Οι <b>σπουδαστές του Β΄ Έτους Διπλώματος</b>, να αποστείλετε άμεσα αντίγραφο Αστυνομικής Ταυτότητας ή
							Διαβατηρίου και αντίγραφο Απολυτηρίου Λυκείου.
						</li>
					</ul>
				</>
			)}

			{level === "traditional_b_anotera" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Οι σπουδαστές Παραδοσιακής &amp; Ευρωπαϊκής Μουσικής:</MailText>
					<ul style={{ ...mailListStyle }}>
						<li>
							Οι <b>σπουδαστές της Β΄ Ανωτέρας τάξης</b> όλων των τμημάτων οργάνων και παραδοσιακού τραγουδιού, να αποστείλετε
							άμεσα στο email της Γραμματείας (<Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)} style={linkStyle}>
								{SCHOOL_CONTACT.emails.secretariat}
							</Link>), αντίγραφο Αστυνομικής
							Ταυτότητας ή Διαβατηρίου και αντίγραφο Απολυτηρίου Λυκείου.
						</li>
					</ul>
				</>
			)}

			{level === "traditional_b_diploma" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Οι σπουδαστές Παραδοσιακής &amp; Ευρωπαϊκής Μουσικής:</MailText>
					<ul style={{ ...mailListStyle }}>
						<li>
							Οι <b>σπουδαστές του Β΄ Διπλώματος</b>, να αποστείλετε άμεσα αντίγραφο Αστυνομικής Ταυτότητας ή Διαβατηρίου και
							αντίγραφο Απολυτηρίου Λυκείου.
						</li>
					</ul>
				</>
			)}
			{type !== "traditional" && (
				<MailText>
					Οι <b>σπουδαστές των Παραρτημάτων</b>, μπορείτε να συνεννοείστε για τα ανωτέρω και με τον Καθηγητή σας.
				</MailText>
			)}
			<MailText>
				Για οποιαδήποτε πληροφορία ή διευκρίνιση σχετικά με την ΕΓΓΡΑΦΗ, τα μαθήματα, τα τμήματα, τις ώρες διδασκαλίας κ.λπ.,
				μπορείτε να επικοινωνείτε με τη Γραμματεία της Σχολής.
			</MailText>

			{type === "byzantine" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Πληροφορίες για τη Βυζαντινή Μουσική:</MailText>
					<MailText style={{ paddingLeft: 24, margin: "4px 0" }}>
						Τηλ.:{" "}
						<Link href={telHref(SCHOOL_CONTACT.phones.secretariat)}>{SCHOOL_CONTACT.phones.secretariat}</Link>
					</MailText>
					<MailText style={{ paddingLeft: 24, margin: "4px 0" }}>
						Email: <Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)}>{SCHOOL_CONTACT.emails.secretariat}</Link> και{" "}
						<Link href={mailHref(SCHOOL_CONTACT.emails.byzantine)}>{SCHOOL_CONTACT.emails.byzantine}</Link>
					</MailText>
				</>
			)}

			{type === "traditional" && (
				<>
					<MailText style={{ fontWeight: 700 }}>Πληροφορίες για την Παραδοσιακή και Ευρωπαϊκή Μουσική:</MailText>
					<MailText style={{ paddingLeft: 24, margin: "4px 0" }}>
						Τηλ.:{" "}
						{SCHOOL_CONTACT.phones.traditional.map((number, index) => (
							<Fragment key={number}>
								{index > 0 && " & "}
								<Link href={telHref(number)}>{number}</Link>
							</Fragment>
						))}
					</MailText>
					<MailText style={{ paddingLeft: 24, margin: "4px 0" }}>
						Email: <Link href={mailHref(SCHOOL_CONTACT.emails.secretariat)}>{SCHOOL_CONTACT.emails.secretariat}</Link>
					</MailText>
				</>
			)}

			<MailText style={{ textAlign: "center" }}>Ευχόμαστε μια δημιουργική και επιτυχημένη μουσική χρονιά!</MailText>
			<MailText style={{ textAlign: "center", marginBottom: 0 }}>Με εκτίμηση</MailText>
			<MailText style={{ textAlign: "center", marginTop: 0 }}>Η Διεύθυνση της Σχολής</MailText>
		</EmailLayout>
	);
}

const mailListStyle = {
	...TYPO.body,
	listStyleType: "square",
	margin: "8px 0 16px",
} as const;

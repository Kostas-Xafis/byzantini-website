import { Link, Text } from "@react-email/components";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { HighlightBox } from "../parts/HighlightBox";
import { SCHOOL_CONTACT } from "../schoolContact";
import { COLORS, FONT_FAMILY } from "../theme";

export type GoogleReviewProps = {
	/** Literal placeholder (e.g. "{{token}}") or a real unsubscribe token. */
	token: string;
	/** Literal placeholder (e.g. "{{first_name}}") or a real first name. */
	first_name: string;
};

/**
 * Αίτημα αξιολόγησης στους Χάρτες Google — a short, warm request to recent
 * students (2024-today) to leave a review on the school's Google Maps listing.
 * No poster attachment: this is a light, one-ask email.
 */
export function GoogleReview({ token, first_name }: GoogleReviewProps) {
	return (
		<EmailLayout
			token={token}
			preview="Μία μικρή χάρη: η γνώμη σας στους Χάρτες Google — δεν θα χρειαστεί πάνω από ένα λεπτό."
			badge="Χάρτες Google">
			<MailText>Χαίρετε, {first_name}! 🎶</MailText>
			<MailText>
				Σας ευχαριστούμε θερμά για την εμπιστοσύνη σας στη{" "}
				<b>Σχολή Βυζαντινής και Παραδοσιακής Μουσικής</b> του Ιερού Ναού Μεταμορφώσεως του
				Σωτήρος. Είτε σπουδάζετε την ιερά τέχνη της ψαλτικής είτε φοιτάτε στα τμήματα
				Παραδοσιακής και Ευρωπαϊκής Μουσικής, η παρουσία σας είναι για εμάς η μεγαλύτερη χαρά
				και επιβράβευση.
			</MailText>
			<MailText>
				Σήμερα σάς ζητούμε μια μικρή, αλλά πολύτιμη χάρη:{" "}
				<b>λίγα λόγια από εσάς στους Χάρτες Google</b>.
			</MailText>
			<MailText>
				Μία σύντομη αξιολόγηση βοηθά νέους ενδιαφερόμενους να ανακαλύψουν τη Σχολή μας και να
				γνωρίσουν τον κόσμο της βυζαντινής και παραδοσιακής μας μουσικής. Κάθε σχόλιο — ακόμη
				και μία μόνο φράση — είναι για εμάς ανεκτίμητο, γιατί προέρχεται από ανθρώπους σαν
				εσάς, που ζουν καθημερινά τη ζωή της Σχολής.
			</MailText>
			<HighlightBox tone="gold" style={{ textAlign: "center", borderLeft: `4px solid ${COLORS.gold}` }}>
				<Text
					style={{
						margin: 0,
						fontFamily: FONT_FAMILY,
						fontSize: 26,
						lineHeight: 1.2,
						letterSpacing: 4,
						color: COLORS.gold,
					}}>
					⭐⭐⭐⭐⭐
				</Text>
				<Text
					style={{
						margin: "8px 0 0",
						fontFamily: FONT_FAMILY,
						fontSize: 16,
						lineHeight: 1.5,
						color: COLORS.text,
						fontWeight: 700,
					}}>
					Η γνώμη σας μετράει πραγματικά
				</Text>
			</HighlightBox>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={SCHOOL_CONTACT.googleMaps.reviewUrl}>Αφήστε την αξιολόγησή σας ⭐</CtaButton>
			</MailText>
			<MailText style={{ textAlign: "center", color: COLORS.textMuted, fontSize: 15 }}>
				Δεν θα χρειαστεί πάνω από ένα λεπτό: ανοίξτε τον σύνδεσμο, επιλέξτε τα αστέρια σας και
				γράψτε ό,τι αισθάνεστε για τα μαθήματα, τους καθηγητές ή την εμπειρία σας στη Σχολή.
			</MailText>
			<MailText>
				Αν ο παραπάνω σύνδεσμος δεν λειτουργεί, μπορείτε να μας βρείτε στους Χάρτες Google
				αναζητώντας «Σχολή Βυζαντινής και Παραδοσιακής Μουσικής — Μεταμόρφωση» ή ακολουθώντας{" "}
				<Link href={SCHOOL_CONTACT.googleMaps.placeUrl} style={{ color: COLORS.brand, fontWeight: "bold" }}>
					αυτόν τον σύνδεσμο
				</Link>
				.
			</MailText>
			<MailText>
				Σας ευχαριστούμε από καρδιάς για τον χρόνο σας. Η γνώμη σας είναι η καλύτερη σύσταση
				που θα μπορούσαμε ποτέ να ζητήσουμε. 🙏🎼
			</MailText>
		</EmailLayout>
	);
}

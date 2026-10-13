import { Body, Html, Text } from "@react-email/components";
import { SCHOOL_CONTACT } from "../schoolContact";

export type GoogleReviewSmsProps = {
	/** Literal placeholder (e.g. "{{first_name}}") or a real first name. */
	first_name: string;
};

/**
 * Αίτημα αξιολόγησης (SMS) — the SMS twin of GoogleReview: one short ask to
 * recent students to review the school on Google Maps.
 *
 * Why the copy is this terse: Greek text is billed as UCS-2, so a multi-part
 * SMS holds only 67 characters per segment (70 for a single segment). The
 * single ⭐ carries the whole warm tone — anything longer would push the
 * message into extra billed segments. The review URL is referenced by its
 * approved short form (g.page/r/…) so the link survives on one line, and the
 * STOP=διαγραφή suffix is the opt-out that marketing SMS are expected to
 * carry.
 *
 * The school is named in full here (from SCHOOL_CONTACT.name, so it can never
 * drift from the emails): a review request reaches students who may have left
 * years ago, so the name has to identify the sender on its own — and this
 * message is billed as 3 segments either way, so the name is free.
 */
export function GoogleReviewSms({ first_name }: GoogleReviewSmsProps) {
	const message = `${first_name}, η γνώμη σας μετράει! ⭐ Αφήστε μια σύντομη αξιολόγηση στη ${SCHOOL_CONTACT.name}: ${SCHOOL_CONTACT.googleMaps.reviewUrl} STOP=διαγραφή`;
	return (
		<Html lang="el">
			<Body>
				<Text>{message}</Text>
			</Body>
		</Html>
	);
}

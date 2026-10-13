import { Body, Html, Text } from "@react-email/components";
import { SCHOOL_CONTACT, siteHref } from "../schoolContact";

export type TeachersSmsProps = {
	/**
	 * Literal placeholder (e.g. "{{greeting}}") or a real per-teacher greeting
	 * that already ends in a comma ("Αγαπητέ συνάδελφε," / "Αγαπητή συναδέλφισσα,").
	 */
	greeting: string;
};

/**
 * Υπενθύμιση εγγραφών προς καθηγητές (SMS) — the SMS twin of
 * UpenthimisiEggrafisKathigites: asks each teacher to encourage their
 * students to register for 2026-27.
 *
 * Why the copy is this terse: Greek text is billed as UCS-2, so a multi-part
 * SMS holds only 67 characters per segment (70 for a single segment). No
 * STOP=διαγραφή here — teachers are staff receiving a service message, not
 * marketing subscribers, exactly as their email carries no unsubscribe
 * footer. The greeting prop supplies its own trailing comma, so the component
 * must not add punctuation of its own.
 */
export function TeachersSms({ greeting }: TeachersSmsProps) {
	const message = `${greeting} οι εγγραφές 2026-27 ξεκίνησαν. Ενθαρρύνετε τους σπουδαστές σας να εγγραφούν: ${siteHref(SCHOOL_CONTACT.paths.registrations)} Πληροφορίες: ${SCHOOL_CONTACT.phones.secretariat}`;
	return (
		<Html lang="el">
			<Body>
				<Text>{message}</Text>
			</Body>
		</Html>
	);
}

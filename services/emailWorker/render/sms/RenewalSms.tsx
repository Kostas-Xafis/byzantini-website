import { Body, Html, Text } from "@react-email/components";
import { SCHOOL_CONTACT, siteHref } from "../schoolContact";

export type RenewalSmsProps = {
	/** Literal placeholder (e.g. "{{first_name}}") or a real first name. */
	first_name: string;
	/** Literal placeholder (e.g. "{{regid}}") or a real registration id. */
	regid: string;
};

/**
 * Υπενθύμιση εγγραφής (SMS) — the SMS twin of UpenthimisiEggrafis: returning
 * students get one short line with their personal registration link.
 *
 * Why the copy is this terse: Greek text is billed as UCS-2, so a multi-part
 * SMS holds only 67 characters per segment (70 for a single segment). Every
 * extra word costs money and hurts deliverability, so there is no greeting,
 * no signature, no styling and no link markup — the URL must stay bare text
 * on the same line. The STOP=διαγραφή suffix is the opt-out that marketing
 * SMS in Greece are expected to carry.
 */
export function RenewalSms({ first_name, regid }: RenewalSmsProps) {
	const registrationUrl = siteHref(`${SCHOOL_CONTACT.paths.registrations}?regid=${regid}`);
	const message = `${first_name}, ολοκληρώστε την εγγραφή σας 2026-27: ${registrationUrl} Πληροφορίες: ${SCHOOL_CONTACT.phones.secretariat}. STOP=διαγραφή`;
	return (
		<Html lang="el">
			<Body>
				<Text>{message}</Text>
			</Body>
		</Html>
	);
}

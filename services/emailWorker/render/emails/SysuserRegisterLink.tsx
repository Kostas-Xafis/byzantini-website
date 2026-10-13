import { Link } from "@react-email/components";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { COLORS } from "../theme";

export type SysuserRegisterLinkProps = {
	/** Literal placeholder (e.g. "{{token}}") or the real 24h signup URL. */
	token: string;
};

/**
 * Πρόσκληση διαχειριστή — transactional email with the 24h signup link for
 * new admin users. Mirrors the original sysuser_register_link.html
 * ({{token}} is both the href and the visible link text).
 */
export function SysuserRegisterLink({ token }: SysuserRegisterLinkProps) {
	return (
		<EmailLayout preview="Πρόσκληση για δημιουργία λογαριασμού διαχειριστή — ο σύνδεσμος ισχύει για 24 ώρες.">
			<MailText>Χαίρετε,</MailText>
			<MailText>
				σας έχει σταλεί πρόσκληση για δημιουργία λογαριασμού διαχειριστή στη Σχολή Βυζαντινής και
				Παραδοσιακής Μουσικής.
			</MailText>
			<MailText>Για να ολοκληρώσετε την εγγραφή σας, πατήστε στον παρακάτω σύνδεσμο:</MailText>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={token}>Ολοκληρώστε την εγγραφή</CtaButton>
			</MailText>
			<MailText>
				Αν ο παραπάνω σύνδεσμος δεν λειτουργεί, αντιγράψτε τον στην μπάρα του browser:
			</MailText>
			<MailText>
				<Link href={token} style={{ color: COLORS.brand, fontWeight: "bold", wordBreak: "break-all" }}>
					{token}
				</Link>
			</MailText>
			<MailText style={{ fontSize: 15, color: COLORS.textMuted }}>Ο σύνδεσμος ισχύει για 24 ώρες.</MailText>
			<MailText>Εκ της Γραμματείας.</MailText>
		</EmailLayout>
	);
}

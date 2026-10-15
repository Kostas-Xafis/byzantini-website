import { Link } from "@react-email/components";
import { CtaButton } from "../parts/CtaButton";
import { EmailLayout, MailText } from "../parts/EmailLayout";
import { COLORS } from "../theme";

export type SysuserPasswordResetProps = {
	/** Literal placeholder (e.g. "{{token}}") or the real 1h reset URL. */
	token: string;
};

/**
 * Επαναφορά κωδικού διαχειριστή — transactional email with the one-time, 1-hour reset link
 * (site: `Authentication.requestPasswordReset`). Same layout as the admin invite.
 */
export function SysuserPasswordReset({ token }: SysuserPasswordResetProps) {
	return (
		<EmailLayout preview="Επαναφορά κωδικού διαχειριστή — ο σύνδεσμος ισχύει για 1 ώρα.">
			<MailText>Χαίρετε,</MailText>
			<MailText>
				λάβαμε αίτημα επαναφοράς του κωδικού του λογαριασμού διαχειριστή σας στη Σχολή Βυζαντινής και
				Παραδοσιακής Μουσικής.
			</MailText>
			<MailText>Για να ορίσετε νέο κωδικό, πατήστε στον παρακάτω σύνδεσμο:</MailText>
			<MailText style={{ textAlign: "center" }}>
				<CtaButton href={token}>Ορισμός νέου κωδικού</CtaButton>
			</MailText>
			<MailText>
				Αν ο παραπάνω σύνδεσμος δεν λειτουργεί, αντιγράψτε τον στην μπάρα του browser:
			</MailText>
			<MailText>
				<Link href={token} style={{ color: COLORS.brand, fontWeight: "bold", wordBreak: "break-all" }}>
					{token}
				</Link>
			</MailText>
			<MailText style={{ fontSize: 15, color: COLORS.textMuted }}>
				Ο σύνδεσμος ισχύει για 1 ώρα και μόνο μία φορά. Αν δεν ζητήσατε εσείς την επαναφορά, αγνοήστε αυτό
				το μήνυμα — ο κωδικός σας δεν αλλάζει.
			</MailText>
			<MailText>Εκ της Γραμματείας.</MailText>
		</EmailLayout>
	);
}

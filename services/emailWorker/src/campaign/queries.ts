import { createDbConnection } from "../db";
import { isGreekMobile, normalizeGreekPhone } from "../sms/phone";
import type { CampaignRecipient, DBKind } from "./types";

type RenewalRecipientRow = {
	am: string;
	email: string;
	first_name: string;
	last_name: string;
	registration_url: string;
	unsubscribe_token: string;
	cellphone: string | null;
	telephone: string | null;
};

type EmailSubscriptionRow = {
	email: string;
	unsubscribe_token: string;
};

/**
 * Picks the number an SMS can actually reach.
 *
 * Greek landlines cannot receive SMS, so only a mobile is accepted: a landline
 * in `telephone` is deliberately ignored rather than queued for a send that
 * would fail and still be billed. `cellphone` is preferred over `telephone`
 * because the register has historically held the mobile there.
 */
function smsPhone(cellphone: unknown, telephone: unknown): string | undefined {
	for (const raw of [cellphone, telephone]) {
		const e164 = normalizeGreekPhone(typeof raw === "string" ? raw : null);
		if (e164 && isGreekMobile(e164)) return e164;
	}
	return undefined;
}

/** School years whose students are considered "recent" for the review campaign. */
export const RECENT_STUDENT_YEARS = ["2025-2026", "2026-2027"];

/**
 * School years covered by "registered in the past 3 years (2024-today)", the
 * audience of the 2026 event invitation. Kept as an explicit list, like the
 * review campaign's window, so the audience of an already-sent campaign cannot
 * change silently when the calendar rolls over.
 */
export const LAST_THREE_YEAR_STUDENT_YEARS = ["2024-2025", "2025-2026", "2026-2027"];

/**
 * Students registered in `prevYear` who have NOT yet registered for `nextYear`.
 *
 * - One row per student (the earliest enrollment of the year wins).
 * - Pupils without a real ΑΜ (the '000' placeholders / split rows) are excluded.
 * - Only students with an email_subscriptions row (i.e. not unsubscribed).
 *
 * NOTE: reads the `pupils` + `pupil_enrollments` tables — the legacy
 * `registrations` table was dropped by migrations/0003_drop_registrations.sql
 * (see the website repo's docs/PUPILS_MIGRATION.md).
 */
export async function getRenewalRecipients(prevYear: string, nextYear: string, db: DBKind = "sqlite-prod"): Promise<CampaignRecipient[]> {
	const conn = createDbConnection(db);
	const result = await conn.execute({
		sql: `SELECT p.am, p.email, p.first_name, p.last_name, p.registration_url, p.cellphone, p.telephone, es.unsubscribe_token
			FROM pupils p
			JOIN email_subscriptions es ON es.email = p.email COLLATE NOCASE
			WHERE p.am IS NOT NULL
				AND p.email IS NOT NULL AND p.email <> ''
				AND EXISTS (
					SELECT 1 FROM pupil_enrollments e
					WHERE e.pupil_id = p.id AND e.registration_year = ?
				)
				AND NOT EXISTS (
					SELECT 1 FROM pupil_enrollments e2
					WHERE e2.pupil_id = p.id AND e2.registration_year = ?
				)
			ORDER BY p.am`,
		args: [prevYear, nextYear],
	});
	const rows = result.rows as unknown as RenewalRecipientRow[];
	return rows.map((r) => ({
		email: r.email,
		phone: smsPhone(r.cellphone, r.telephone),
		templateData: {
			token: r.unsubscribe_token ?? "",
			regid: r.registration_url,
			am: r.am,
			first_name: r.first_name,
			last_name: r.last_name,
		},
	}));
}

/**
 * The full emailing list (email_subscriptions) for former students, i.e.:
 *
 * - base: every subscribed email (both the pre-website list and the website-era rows),
 * - minus anyone with an enrollment in a school year starting 2024 or later
 *   (student signups from 2024-today — recent/current students),
 * - minus teacher emails (teachers table),
 * - minus internal accounts (sys_users),
 * - minus malformed addresses (missing/duplicated @ or whitespace).
 *
 * No per-recipient data besides the unsubscribe token is available for these
 * addresses (legacy list), so the template must not require more placeholders.
 *
 * NOTE: this legacy list holds email addresses only — there are no phone
 * numbers to go with them, so `phone` is always undefined and these recipients
 * can only ever be reached by email.
 */
export async function getReturningStudentsRecipients(db: DBKind = "sqlite-prod"): Promise<CampaignRecipient[]> {
	const conn = createDbConnection(db);
	const result = await conn.execute({
		sql: `SELECT es.email, es.unsubscribe_token
			FROM email_subscriptions es
			WHERE NOT EXISTS (
				SELECT 1 FROM pupil_enrollments e
				JOIN pupils p ON p.id = e.pupil_id
				WHERE e.registration_year >= ?
					AND LOWER(TRIM(p.email)) = LOWER(TRIM(es.email))
			)
			AND NOT EXISTS (
				SELECT 1 FROM teachers t
				WHERE t.email IS NOT NULL AND TRIM(t.email) <> ''
					AND LOWER(TRIM(t.email)) = LOWER(TRIM(es.email))
			)
			AND NOT EXISTS (
				SELECT 1 FROM sys_users s
				WHERE LOWER(TRIM(s.email)) = LOWER(TRIM(es.email))
			)
			AND TRIM(es.email) <> ''
			AND TRIM(es.email) LIKE '%@%'
			AND TRIM(es.email) NOT LIKE '%@%@%'
			AND TRIM(es.email) NOT LIKE '% %'
			-- Site-era addresses (unrelated=0) first: they are the freshest/most
			-- likely valid, so warm-up waves should start with them.
			ORDER BY es.unrelated ASC, TRIM(es.email)`,
		args: ["2024-2025"],
	});
	const rows = result.rows as unknown as EmailSubscriptionRow[];
	return rows.map((r) => ({
		email: r.email.trim(),
		templateData: { token: r.unsubscribe_token ?? "" },
	}));
}

type RecentStudentRow = {
	email: string;
	first_name: string;
	unsubscribe_token: string;
	cellphone: string | null;
	telephone: string | null;
};

/**
 * Students with an enrollment in any of `years`, one row per subscribed email.
 *
 * Shared by the review campaign and the event-invitation campaign, which differ
 * only in their window and in whether the copy greets by first name:
 *
 * - one row per pupil (the earliest matching row wins; the runner also dedupes
 *   by email, so a shared family address is only messaged once),
 * - only students with an `email_subscriptions` row (i.e. not unsubscribed),
 * - minus teacher emails (teachers table) and internal accounts (sys_users),
 * - `requireFirstName` keeps only rows a template can greet by name.
 *
 * `includeOrphans` decides what happens to pupils whose `am` is NULL. Those are
 * real registrations — a pupil whose ΑΜ was shared and split off, or was
 * unusable and became a `000-Οn` review code (see docs/PUPILS_MIGRATION.md) —
 * so an invitation addressed to registrants keeps them, while a campaign built
 * around ΑΜ-shaped data drops them.
 */
async function getStudentsByEnrollmentYears(
	years: string[],
	db: DBKind,
	{ requireFirstName = false, includeOrphans = false }: { requireFirstName?: boolean; includeOrphans?: boolean } = {},
): Promise<CampaignRecipient[]> {
	const conn = createDbConnection(db);
	const placeholders = years.map(() => "?").join(", ");
	const result = await conn.execute({
		sql: `SELECT p.email, p.first_name, p.cellphone, p.telephone, es.unsubscribe_token
			FROM pupils p
			JOIN email_subscriptions es ON es.email = p.email COLLATE NOCASE
			WHERE p.email IS NOT NULL AND TRIM(p.email) <> ''
				${includeOrphans ? "" : "AND p.am IS NOT NULL"}
				${requireFirstName ? "AND p.first_name IS NOT NULL AND TRIM(p.first_name) <> ''" : ""}
				AND EXISTS (
					SELECT 1 FROM pupil_enrollments e
					WHERE e.pupil_id = p.id
						AND e.registration_year IN (${placeholders})
				)
				AND NOT EXISTS (
					SELECT 1 FROM teachers t
					WHERE t.email IS NOT NULL AND TRIM(t.email) <> ''
						AND t.email = p.email COLLATE NOCASE
				)
				AND NOT EXISTS (
					SELECT 1 FROM sys_users s
					WHERE s.email = p.email COLLATE NOCASE
				)
			ORDER BY p.am`,
		args: [...years],
	});
	const rows = result.rows as unknown as RecentStudentRow[];
	return rows.map((r) => ({
		email: r.email.trim(),
		phone: smsPhone(r.cellphone, r.telephone),
		templateData: {
			token: r.unsubscribe_token ?? "",
			first_name: r.first_name.trim(),
		},
	}));
}

/**
 * Recent students (enrollments from 2025-today) for the Google-review campaign —
 * the template greets by first name, so pupils without one are dropped.
 */
export async function getRecentStudentsRecipients(db: DBKind = "sqlite-prod"): Promise<CampaignRecipient[]> {
	return getStudentsByEnrollmentYears(RECENT_STUDENT_YEARS, db, { requireFirstName: true });
}

/**
 * Everyone registered in the last three school years (2024-today), for the 2026
 * event invitation. Orphans are included: they hold a real enrollment for one of
 * those years and would otherwise never hear about an event addressed to all
 * students. The copy is not personalised, so a missing ΑΜ or first name is no
 * reason to drop a registered family.
 */
export async function getLastThreeYearsStudentRecipients(db: DBKind = "sqlite-prod"): Promise<CampaignRecipient[]> {
	return getStudentsByEnrollmentYears(LAST_THREE_YEAR_STUDENT_YEARS, db, { includeOrphans: true });
}

type TeacherRow = {
	email: string;
	gender: string;
	unsubscribe_token: string | null;
	telephone: string | null;
};

/**
 * Active teachers (visible on the website) with an email address, for the
 * teacher reminder campaigns:
 *
 * - the greeting is computed per recipient from the teachers.gender column
 *   ("Αγαπητέ συνάδελφε," / "Αγαπητή συναδέλφισσα,"),
 * - unsubscribe token is included when the teacher also has an
 *   email_subscriptions row, but the teacher template does not render an
 *   unsubscribe footer (teachers are staff, not mailing-list subscribers).
 *
 * The teachers table has no separate mobile column, so `telephone` is the only
 * source for an SMS number and it is used only when it is a mobile.
 */
export async function getTeacherRecipients(db: DBKind = "sqlite-prod"): Promise<CampaignRecipient[]> {
	const conn = createDbConnection(db);
	const result = await conn.execute({
		sql: `SELECT t.email, t.gender, t.telephone, es.unsubscribe_token
			FROM teachers t
			LEFT JOIN email_subscriptions es ON es.email = t.email COLLATE NOCASE
			WHERE t.email IS NOT NULL AND TRIM(t.email) <> ''
				AND t.visible = 1
			ORDER BY t.id`,
		args: [],
	});
	const rows = result.rows as unknown as TeacherRow[];
	return rows.map((r) => ({
		email: r.email.trim(),
		phone: smsPhone(null, r.telephone),
		templateData: {
			token: r.unsubscribe_token ?? "",
			greeting: r.gender === "F" ? "Αγαπητή συνάδελφε," : "Αγαπητέ συνάδελφε,",
		},
	}));
}

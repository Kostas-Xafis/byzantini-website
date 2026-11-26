import { Bucket } from "@bucket/index";
import { APIError } from "@lib/api/routes/APIError";
import { sha256Hex } from "@lib/auth/passwords";
import { currentSchoolYear } from "@lib/pupils/years";
import { executeQuery } from "@lib/utils.server";
import { accessToken, type ContactsLink } from "./link.server";
import { MY_CONTACTS, PeopleAPIError, batchCreate, batchDelete, batchUpdate, createGroup, listGroups, listPeople, toExisting } from "./people.server";
import {
	GROUP_KEYS,
	GROUP_NAMES,
	buildDesiredContacts,
	formatPhone,
	planContacts,
	planCounts,
	type ContactsPlan,
	type GroupKey,
	type PlanCounts,
	type RegisterPupil,
	type RegisterTeacher,
} from "./plan";

/**
 * «Επαφές Google» sync — server-only. `previewSync` computes the plan (nothing is written); `applySync`
 * recomputes it, refuses when it differs from the previewed one (`planHash`), backs up every contact of the
 * account to R2, then creates the labels, creates / updates the contacts and deletes the ones that left the
 * register (and the duplicates, when asked). Every step is safe to repeat: a failed run is finished by the next.
 */

/** R2 prefix of the pre-sync backups (not public: lib/bucket/publicFiles.ts serves only its own prefixes). */
export const BACKUP_PREFIX = "contacts_backups/";

type PupilRow = {
	id: number;
	am: number | null;
	orphan_code: string;
	first_name: string;
	last_name: string;
	cellphone: string;
	telephone: string;
	email: string;
	classes: string | null;
	last_year: string | null;
	current: number | null;
};

/** Every pupil of the register with their departments and latest year. */
export async function loadRegister(): Promise<RegisterPupil[]> {
	const rows = await executeQuery<PupilRow>(
		`SELECT p.id, p.am, p.orphan_code, p.first_name, p.last_name, p.cellphone, p.telephone, p.email,
		        GROUP_CONCAT(DISTINCT e.class_id) AS classes, MAX(e.registration_year) AS last_year, MAX(e.registration_year = ?) AS current
		   FROM pupils p LEFT JOIN pupil_enrollments e ON e.pupil_id = p.id
		  GROUP BY p.id`,
		[currentSchoolYear()],
	);
	return rows.map((row) => ({
		id: row.id,
		am: row.am !== null ? String(row.am) : row.orphan_code,
		first_name: row.first_name,
		last_name: row.last_name,
		cellphone: row.cellphone,
		telephone: row.telephone,
		email: row.email,
		classes: (row.classes ?? "")
			.split(",")
			.filter(Boolean)
			.map(Number)
			.filter((n) => Number.isInteger(n)),
		last_year: row.last_year ?? "",
		current: row.current === 1,
	}));
}

/** Every teacher with the departments they teach (also teachers no longer shown on the site: their number is still theirs). */
export async function loadTeachers(): Promise<RegisterTeacher[]> {
	const rows = await executeQuery<{
		id: number;
		fullname: string;
		telephone: string | null;
		email: string | null;
		title: number | null;
		gender: string | null;
		classes: string | null;
	}>(
		`SELECT t.id, t.fullname, t.telephone, t.email, t.title, t.gender, GROUP_CONCAT(DISTINCT tc.class_id) AS classes
		   FROM teachers t LEFT JOIN teacher_classes tc ON tc.teacher_id = t.id
		  GROUP BY t.id`,
	);
	return rows.map((row) => ({
		id: row.id,
		fullname: row.fullname,
		telephone: row.telephone ?? "",
		email: row.email ?? "",
		title: row.title ?? 0,
		gender: row.gender ?? "M",
		classes: (row.classes ?? "")
			.split(",")
			.filter(Boolean)
			.map(Number)
			.filter((n) => Number.isInteger(n)),
	}));
}

/** Label resource names by key; a label that does not exist yet gets a placeholder (preview only). */
function resolveGroups(groups: { resourceName: string; name: string; groupType?: string }[]) {
	const ids = {} as Record<GroupKey, string>;
	const missing: GroupKey[] = [];
	for (const key of GROUP_KEYS) {
		const found = groups.find((g) => g.groupType !== "SYSTEM_CONTACT_GROUP" && g.name === GROUP_NAMES[key]);
		if (found) ids[key] = found.resourceName;
		else {
			ids[key] = `pending:${key}`;
			missing.push(key);
		}
	}
	return { ids, missing };
}

/** A fingerprint of what the plan would do (and of the contacts' versions), so «Εφαρμογή» does what was previewed. */
async function hashPlan(plan: ContactsPlan) {
	return sha256Hex(
		JSON.stringify([
			plan.create.map((c) => [c.key, c.givenName, c.familyName, c.phones, c.emails, c.note, c.groups]),
			plan.update.map((u) => [u.resourceName, u.etag, u.desired.key, u.changes]),
			plan.remove.map((r) => r.resourceName),
			plan.duplicates.map((r) => r.resourceName),
		]),
	);
}

async function computePlan() {
	const { token, link } = await accessToken();
	const [people, groups, register, teachers] = await Promise.all([listPeople(token), listGroups(token), loadRegister(), loadTeachers()]);
	const { ids, missing } = resolveGroups(groups);
	const plan = planContacts(buildDesiredContacts(register, teachers), people.map(toExisting), ids);
	return { token, link, people, groupIds: ids, missingGroups: missing, plan, hash: await hashPlan(plan) };
}

const wrapGoogleError = (error: unknown): never => {
	if (error instanceof PeopleAPIError) {
		console.error("[contacts] People API:", error.status, error.message);
		if (error.status === 401 || error.status === 403)
			throw APIError.forbidden(`Η Google αρνήθηκε την πρόσβαση στις επαφές (${error.message}). Συνδέστε ξανά τον λογαριασμό.`);
		throw APIError.badRequest(`Η Google απέρριψε το αίτημα: ${error.message}`);
	}
	throw error;
};

/** The plan as the page shows it. */
export async function previewSync() {
	try {
		const { link, people, plan, hash, missingGroups } = await computePlan();
		return {
			account_email: link.account_email,
			contactsTotal: people.length,
			hash,
			counts: planCounts(plan),
			newLabels: missingGroups.map((g) => GROUP_NAMES[g]),
			create: plan.create.map((c) => ({ name: [c.givenName, c.familyName].filter(Boolean).join(" "), phone: formatPhone(c.key), people: c.people })),
			update: plan.update.map((u) => ({
				from: u.from,
				to: [u.desired.givenName, u.desired.familyName].filter(Boolean).join(" "),
				phone: formatPhone(u.desired.key),
				adopted: u.adopted,
				changes: u.changes,
			})),
			remove: plan.remove,
			duplicates: plan.duplicates,
			excluded: plan.excluded.map((e) => ({ phone: formatPhone(e.key), pupils: e.pupils })),
			noPhone: plan.noPhone,
			untouchedShared: plan.untouchedShared,
		};
	} catch (error) {
		return wrapGoogleError(error);
	}
}

export type SyncSummary = PlanCounts & {
	created: number;
	updated: number;
	removed: number;
	duplicatesRemoved: number;
	labelsCreated: number;
	backup: string;
	error?: string;
};

async function saveSummary(summary: SyncSummary, adminEmail: string) {
	await executeQuery("UPDATE google_contacts_link SET last_sync_at = ?, last_sync_by = ?, last_sync_summary = ? WHERE id = 1", [
		Date.now(),
		adminEmail,
		JSON.stringify(summary),
	]);
}

async function backup(link: ContactsLink, people: unknown[]) {
	const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
	await Bucket.put(JSON.stringify({ account: link.account_email, taken_at: Date.now(), contacts: people }), key, "application/json");
	return key;
}

/** Applies the previewed plan. */
export async function applySync(planHash: string, deleteDuplicates: boolean, adminEmail: string): Promise<SyncSummary> {
	let computed;
	try {
		computed = await computePlan();
	} catch (error) {
		return wrapGoogleError(error);
	}
	const { token, link, people, plan, hash, missingGroups } = computed;
	if (hash !== planHash) throw APIError.conflict("Οι επαφές ή το Μαθητολόγιο άλλαξαν από την προεπισκόπηση. Δείτε ξανά τις αλλαγές πριν τις εφαρμόσετε.");

	const summary: SyncSummary = {
		...planCounts(plan),
		created: 0,
		updated: 0,
		removed: 0,
		duplicatesRemoved: 0,
		labelsCreated: 0,
		backup: await backup(link, people),
	};
	try {
		const groupIds = { ...computed.groupIds };
		for (const key of missingGroups) {
			groupIds[key] = (await createGroup(token, GROUP_NAMES[key])).resourceName;
			summary.labelsCreated++;
		}
		const ownGroups = new Set(Object.values(groupIds));
		const existingGroups = new Map(people.map((p) => [p.resourceName ?? "", toExisting(p).groups]));
		summary.created = await batchCreate(token, plan.create, groupIds);
		summary.updated = await batchUpdate(
			token,
			plan.update.map((u) => ({
				resourceName: u.resourceName,
				etag: u.etag,
				desired: u.desired,
				// Keep what the school added by hand (starred, its own labels); the sync's labels are re-set.
				keepGroups: (existingGroups.get(u.resourceName) ?? []).filter((g) => g !== MY_CONTACTS && !ownGroups.has(g)),
			})),
			groupIds,
		);
		summary.removed = await batchDelete(
			token,
			plan.remove.map((r) => r.resourceName),
		);
		if (deleteDuplicates)
			summary.duplicatesRemoved = await batchDelete(
				token,
				plan.duplicates.map((r) => r.resourceName),
			);
	} catch (error) {
		summary.error = error instanceof Error ? error.message : String(error);
		await saveSummary(summary, adminEmail);
		return wrapGoogleError(error);
	}
	await saveSummary(summary, adminEmail);
	return summary;
}

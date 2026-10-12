/**
 * scripts/lib/pupilsBackfill.ts — the pure half of the pupil-register backfill.
 *
 * Takes the legacy `registrations` rows and decides, with no database access of
 * any kind, what the new `pupils` + `pupil_enrollments` rows must be. Splitting
 * it out of the CLI (scripts/migratePupils.ts) keeps the rules readable, makes
 * them unit-testable, and means the same plan drives the dry run, the report and
 * the write.
 *
 * Design rules (docs/PUPILS_MIGRATION.md §2, D2/D5/Q1/Q6):
 *   • ΑΜ is the key, but it is NOT trusted blindly. 128 ΑΜ carry more than one
 *     name in the data, so every cluster is PROVE-OR-SPLIT: a name variant is
 *     merged only when ΑΜΚΑ, cellphone or email prove it is the same person;
 *     otherwise it becomes a suffix split (111, 111-Σ1, 111-Σ2).
 *   • '000' / '000 - Αναμονή' / '999 - Αναμονή' are orphans. They are first
 *     re-united with a real pupil when identity keys prove it, otherwise they get
 *     a review code (000-Ο1, 000-Ο2, …) and needs_review = 1.
 *   • Unparseable ΑΜ (7/9 digits) are orphans too.
 *   • A pupil's fields come from their LATEST row, back-filled from older rows.
 *   • registration_url becomes permanent on the pupil; duplicates are dropped
 *     and flagged rather than silently assigned.
 */
import {
	canonicalClassYear,
	isMissingClassYear,
	normalizeAmka,
	normalizeText,
	parseAm,
	personIdentityKeys,
	personNameKey,
	type ParsedAm,
	type PersonKey,
} from "../../lib/pupils/normalize";
import type { SqlStatement } from "./d1";

// ---------------------------------------------------------------------------
// Legacy row shape
// ---------------------------------------------------------------------------

export type LegacyRow = {
	id: number;
	am: string | null;
	amka: string | null;
	last_name: string | null;
	first_name: string | null;
	fathers_name: string | null;
	birth_date: number | null;
	road: string | null;
	number: number | null;
	tk: number | null;
	region: string | null;
	telephone: string | null;
	cellphone: string | null;
	email: string | null;
	registration_year: string | null;
	class_year: string | null;
	class_id: number | null;
	teacher_id: number | null;
	instrument_id: number | null;
	date: number | null;
	payment_amount: number | null;
	total_payment: number | null;
	payment_date: number | null;
	pass: number | null;
	registration_url: string | null;
};

export const LEGACY_COLUMNS = [
	"id",
	"am",
	"amka",
	"last_name",
	"first_name",
	"fathers_name",
	"birth_date",
	"road",
	"number",
	"tk",
	"region",
	"telephone",
	"cellphone",
	"email",
	"registration_year",
	"class_year",
	"class_id",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
	"registration_url",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClusterRow = {
	row: LegacyRow;
	nameKey: string;
	identity: PersonKey[];
	am: ParsedAm;
};

export type SubCluster = {
	nameKey: string;
	rows: ClusterRow[];
};

export type PupilCluster = {
	am: number | null;
	/** Set when this row was split off a real ΑΜ (two people shared it). */
	splitFromAm: number | null;
	orphanCode: string;
	subClusters: SubCluster[];
	needsReview: boolean;
	notes: string[];
};

export type IssueCode =
	| "am_zero"
	| "am_waiting"
	| "am_invalid"
	| "am_shared_different_names"
	| "name_merged_by_identity"
	| "name_split_no_identity"
	| "class_year_missing"
	| "class_year_unmapped"
	| "class_id_out_of_range"
	| "registration_url_duplicate"
	| "registration_url_missing"
	| "amka_invalid"
	| "shared_cellphone"
	| "missing_date";

export type Issue = { code: IssueCode; detail: string };

export type BuiltPupil = {
	am: number | null;
	orphanCode: string;
	splitFromAm: number | null;
	needsReview: number;
	reviewNote: string;
	first_name: string;
	last_name: string;
	fathers_name: string;
	birth_date: number;
	road: string;
	number: number;
	tk: number;
	region: string;
	telephone: string;
	cellphone: string;
	email: string;
	amka: string;
	registration_url: string;
	enrollments: BuiltEnrollment[];
};

/**
 * The `pupil_enrollments` fields a single legacy row maps to.
 *
 * One legacy row ⇒ one enrollment, always: the backfill never merges or drops
 * enrollments (only pupils are merged/split). This is the single mapping used by
 * `buildPupils` AND by the port's row-conservation check, so the verification
 * cannot drift away from what is actually written.
 */
export type EnrollmentFields = {
	registration_year: string;
	class_id: number;
	class_year: string;
	teacher_id: number;
	instrument_id: number;
	date: number;
	payment_amount: number;
	total_payment: number;
	payment_date: number | null;
	pass: number;
};

/** Historical name for `EnrollmentFields` (one per built pupil). */
export type BuiltEnrollment = EnrollmentFields;

export type BackfillStats = {
	enrollments: number;
	validAm: number;
	orphanZero: number;
	orphanWaiting: number;
	amInvalid: number;
	orphansAttached: number;
	merges: number;
	splits: number;
};

export type BackfillPlan = {
	pupils: BuiltPupil[];
	issues: Issue[];
	stats: BackfillStats;
	urlConflicts: Map<string, BuiltPupil[]>;
};

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/** Union-find over sub-cluster indexes, merged when they share an identity key. */
function mergeSubClustersBy(subClusters: SubCluster[]): SubCluster[] {
	const parent = subClusters.map((_, index) => index);
	const find = (index: number): number => {
		let root = index;
		while (parent[root] !== root) root = parent[root]!;
		while (parent[index] !== root) {
			const next = parent[index]!;
			parent[index] = root;
			index = next;
		}
		return root;
	};
	const union = (a: number, b: number) => {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parent[rootB] = rootA;
	};

	const byKey = new Map<string, number>();
	for (let index = 0; index < subClusters.length; index++) {
		for (const key of subClusters[index]!.rows[0]!.identity) {
			const mapKey = `${key.type}:${key.value}`;
			const existing = byKey.get(mapKey);
			if (existing === undefined) byKey.set(mapKey, index);
			else union(existing, index);
		}
	}

	const groups = new Map<number, SubCluster>();
	for (let index = 0; index < subClusters.length; index++) {
		const root = find(index);
		const sub = subClusters[index]!;
		const existing = groups.get(root);
		if (!existing) groups.set(root, { nameKey: sub.nameKey, rows: [...sub.rows] });
		else existing.rows.push(...sub.rows);
	}
	return [...groups.values()].map((group) => ({
		nameKey: group.nameKey,
		rows: group.rows.sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id),
	}));
}

/** Splits one ΑΜ cluster into sub-clusters (by name), then merges by identity. */
function splitAndMerge(rows: ClusterRow[]): { subClusters: SubCluster[]; merged: number; split: number } {
	const byName = new Map<string, ClusterRow[]>();
	for (const row of rows) {
		const key = row.nameKey || `__empty_${row.row.id}`;
		const bucket = byName.get(key);
		if (bucket) bucket.push(row);
		else byName.set(key, [row]);
	}
	const raw = [...byName.entries()].map(([nameKey, bucket]) => ({
		nameKey,
		rows: bucket.sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id),
	}));
	const merged = mergeSubClustersBy(raw);
	return { subClusters: merged, merged: raw.length - merged.length, split: merged.length - 1 };
}

/**
 * Orphans first try to re-unite with a real pupil through identity keys
 * (ΑΜΚΑ → cellphone → email). Rows with no name never merge this way.
 */
function attachOrphans(clusters: PupilCluster[], orphans: ClusterRow[], issues: Issue[]): { orphans: ClusterRow[]; attached: number } {
	const byIdentity = new Map<string, PupilCluster>();
	for (const cluster of clusters) {
		if (cluster.am === null) continue;
		for (const sub of cluster.subClusters) {
			for (const key of sub.rows[0]!.identity) byIdentity.set(`${key.type}:${key.value}`, cluster);
		}
	}

	const remaining: ClusterRow[] = [];
	let attached = 0;
	for (const orphan of orphans) {
		let target: PupilCluster | undefined;
		let via: PersonKey | undefined;
		for (const key of orphan.identity) {
			const found = byIdentity.get(`${key.type}:${key.value}`);
			if (found) {
				target = found;
				via = key;
				break;
			}
		}
		if (!target || !via) {
			remaining.push(orphan);
			continue;
		}
		target.subClusters.push({ nameKey: orphan.nameKey, rows: [orphan] });
		target.notes.push(`συνενώθηκε με εγγραφή χωρίς ΑΜ (${orphan.am.reason}) μέσω ${via.type}`);
		issues.push({
			code: "name_merged_by_identity",
			detail: `orphan id=${orphan.row.id} (${orphan.am.reason}) → ΑΜ ${target.am} via ${via.type}=${via.value}`,
		});
		attached++;
	}
	return { orphans: remaining, attached };
}

// ---------------------------------------------------------------------------
// Pupil construction
// ---------------------------------------------------------------------------

/**
 * Latest non-empty value wins; empty values fall back to older rows.
 * `rows` are `ClusterRow`s (the newest first) — the getter receives the raw
 * legacy row, NOT the wrapper.
 */
function pickLatest<T>(rows: ClusterRow[], get: (row: LegacyRow) => T | null | undefined, isEmpty: (value: T) => boolean): T | undefined {
	for (const entry of rows) {
		const value = get(entry.row);
		if (value === null || value === undefined) continue;
		if (isEmpty(value)) continue;
		return value;
	}
	return undefined;
}

/**
 * Maps one legacy row to its enrollment fields. See `EnrollmentFields`.
 */
export function enrollmentFields(row: LegacyRow): EnrollmentFields {
	const rawClassYear = row.class_year;
	return {
		registration_year: normalizeText(row.registration_year) || "Άγνωστο",
		class_id: row.class_id ?? 0,
		class_year: canonicalClassYear(rawClassYear) || normalizeText(rawClassYear),
		teacher_id: row.teacher_id ?? -1,
		instrument_id: row.instrument_id ?? 0,
		date: row.date ?? 0,
		payment_amount: row.payment_amount ?? 0,
		total_payment: row.total_payment ?? 0,
		payment_date: row.payment_date ?? null,
		pass: row.pass ? 1 : 0,
	};
}

/**
 * The tuple the row-conservation invariant groups on (docs/PUPILS_MIGRATION.md):
 * `(year, class, teacher, instrument, date, amounts, payment date, pass)`.
 * Grouping the legacy rows and the written enrollments by this key must produce
 * the same multiset — in both directions.
 */
export const CONSERVATION_FIELDS = [
	"registration_year",
	"class_id",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
] as const satisfies readonly (keyof EnrollmentFields)[];

/** The conservation key of one enrollment (or of one legacy row, via `enrollmentFields`). */
export function conservationKey(fields: EnrollmentFields): string {
	return JSON.stringify(CONSERVATION_FIELDS.map((field) => fields[field] ?? null));
}

function buildPupils(clusters: PupilCluster[], issues: Issue[], stats: BackfillStats): { pupils: BuiltPupil[]; urlConflicts: Map<string, BuiltPupil[]> } {
	const pupils: BuiltPupil[] = [];
	const urlOwners = new Map<string, BuiltPupil[]>();

	for (const cluster of clusters) {
		// Newest row overall drives the pupil record.
		const allRows = cluster.subClusters.flatMap((sub) => sub.rows).sort((a, b) => (b.row.date ?? 0) - (a.row.date ?? 0) || b.row.id - a.row.id);
		if (allRows.length === 0) continue;

		const nonEmptyString = (value: string | null | undefined) => normalizeText(value) === "";
		const isZero = (value: number) => !value;

		// The API contract for an ΑΜΚΑ (`z_Amka`) is '' or exactly 11 digits. A
		// shorter/longer value — a typo, or a legacy row that never really had one —
		// would make EVERY listing that contains this pupil fail response-schema
		// validation (a 500 from the admin table), so it is dropped to '' and the
		// pupil is flagged for the secretaries instead. The value itself is never
		// logged or noted (it is personal data); the digit count is enough to act on.
		const rawAmka =
			allRows.map((entry) => normalizeAmka(entry.row.amka)).find((value) => value !== "") ??
			allRows.map((entry) => (entry.row.amka ?? "").trim()).find((value) => value !== "") ??
			"";
		const amka = /^\d{11}$/.test(rawAmka) ? rawAmka : "";
		const amkaRejected = amka !== rawAmka;
		const notes = [...cluster.notes];
		if (amkaRejected) notes.push(`μη έγκυρο ΑΜΚΑ (${rawAmka.length} ψηφία αντί για 11) — χρειάζεται έλεγχο`);

		const built: BuiltPupil = {
			am: cluster.am,
			orphanCode: cluster.orphanCode,
			splitFromAm: cluster.splitFromAm,
			needsReview: cluster.needsReview || amkaRejected ? 1 : 0,
			reviewNote: notes.join("; "),
			first_name: normalizeText(pickLatest(allRows, (r) => r.first_name, nonEmptyString) ?? ""),
			last_name: normalizeText(pickLatest(allRows, (r) => r.last_name, nonEmptyString) ?? ""),
			fathers_name: normalizeText(pickLatest(allRows, (r) => r.fathers_name, nonEmptyString) ?? ""),
			birth_date: pickLatest(allRows, (r) => r.birth_date ?? 0, isZero) ?? 0,
			road: normalizeText(pickLatest(allRows, (r) => r.road, nonEmptyString) ?? ""),
			number: pickLatest(allRows, (r) => r.number ?? 0, isZero) ?? 0,
			tk: pickLatest(allRows, (r) => r.tk ?? 0, isZero) ?? 0,
			region: normalizeText(pickLatest(allRows, (r) => r.region, nonEmptyString) ?? ""),
			telephone: normalizeText(pickLatest(allRows, (r) => r.telephone, nonEmptyString) ?? "-") || "-",
			cellphone: normalizeText(pickLatest(allRows, (r) => r.cellphone, nonEmptyString) ?? ""),
			email: normalizeText(pickLatest(allRows, (r) => r.email, nonEmptyString) ?? ""),
			amka,
			registration_url: "",
			enrollments: [],
		};

		// registration_url: newest non-empty value; conflicts are resolved later.
		const url = pickLatest(allRows, (r) => r.registration_url, nonEmptyString);
		if (url) {
			built.registration_url = normalizeText(url);
			const owners = urlOwners.get(built.registration_url);
			if (owners) owners.push(built);
			else urlOwners.set(built.registration_url, [built]);
		} else {
			issues.push({ code: "registration_url_missing", detail: `pupil ${built.am ?? built.orphanCode} (${built.last_name} ${built.first_name})` });
		}

		if (amkaRejected) {
			issues.push({
				code: "amka_invalid",
				detail: `pupil ${built.am ?? built.orphanCode} — ΑΜΚΑ με ${rawAmka.length} ψηφία αντί για 11 (καθαρίστηκε, χρειάζεται έλεγχο)`,
			});
		}

		// Enrollments: one per source row.
		for (const entry of allRows) {
			const row = entry.row;
			const fields = enrollmentFields(row);
			const classId = fields.class_id;
			if (classId < 0 || classId > 2) {
				issues.push({ code: "class_id_out_of_range", detail: `registration id=${row.id} class_id=${classId}` });
			}
			const rawClassYear = row.class_year;
			if (isMissingClassYear(rawClassYear)) {
				issues.push({ code: "class_year_missing", detail: `registration id=${row.id} (${normalizeText(rawClassYear) || "κενό"})` });
			} else if (canonicalClassYear(rawClassYear) === "") {
				issues.push({ code: "class_year_unmapped", detail: `registration id=${row.id} class_year='${normalizeText(rawClassYear)}'` });
			}
			if (!fields.date) issues.push({ code: "missing_date", detail: `registration id=${row.id}` });

			built.enrollments.push(fields);
		}
		stats.enrollments += built.enrollments.length;
		pupils.push(built);
	}

	return { pupils, urlConflicts: urlOwners };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Turns the legacy rows into the plan: clusters them, re-unites what identity
 * keys prove, splits what they do not, and records every issue found.
 */
export function planBackfill(legacy: LegacyRow[]): BackfillPlan {
	const issues: Issue[] = [];
	const stats: BackfillStats = {
		enrollments: 0,
		validAm: 0,
		orphanZero: 0,
		orphanWaiting: 0,
		amInvalid: 0,
		orphansAttached: 0,
		merges: 0,
		splits: 0,
	};

	const validByAm = new Map<number, ClusterRow[]>();
	const orphanRows: ClusterRow[] = [];

	for (const row of legacy) {
		const am = parseAm(row.am);
		const entry: ClusterRow = { row, nameKey: personNameKey(row), identity: personIdentityKeys(row), am };
		if (am.kind === "valid") {
			stats.validAm++;
			const bucket = validByAm.get(am.am!);
			if (bucket) bucket.push(entry);
			else validByAm.set(am.am!, [entry]);
			continue;
		}
		if (am.kind === "orphan") {
			if (am.reason === "waiting") {
				stats.orphanWaiting++;
				issues.push({ code: "am_waiting", detail: `id=${row.id} am='${am.raw}' (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})` });
			} else {
				stats.orphanZero++;
				issues.push({ code: "am_zero", detail: `id=${row.id} am='${am.raw}' (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})` });
			}
		} else {
			stats.amInvalid++;
			issues.push({
				code: "am_invalid",
				detail: `id=${row.id} am='${am.raw}' reason=${am.reason} (${normalizeText(row.last_name)} ${normalizeText(row.first_name)})`,
			});
		}
		orphanRows.push(entry);
	}

	// --- cluster valid ΑΜs ---------------------------------------------------
	const clusters: PupilCluster[] = [];
	for (const [am, rows] of [...validByAm.entries()].sort((a, b) => a[0] - b[0])) {
		const { subClusters, merged, split } = splitAndMerge(rows);
		stats.merges += merged;
		stats.splits += split;
		if (subClusters.length > 1) {
			issues.push({
				code: "am_shared_different_names",
				detail: `ΑΜ ${am}: ${subClusters.length} ομάδες → ${subClusters.map((s) => s.rows[0]!.row.last_name + " " + s.rows[0]!.row.first_name).join(" | ")}`,
			});
		}
		if (merged > 0) {
			issues.push({ code: "name_merged_by_identity", detail: `ΑΜ ${am}: ${merged} ομάδα(ες) ονόματος συνενώθηκαν μέσω ΑΜΚΑ/τηλεφώνου/email` });
		}
		subClusters
			.sort((a, b) => (b.rows[0]!.row.date ?? 0) - (a.rows[0]!.row.date ?? 0))
			.forEach((sub, index) => {
				clusters.push({
					am: index === 0 ? am : null,
					splitFromAm: index === 0 ? null : am,
					orphanCode: index === 0 ? "" : `${am}-Σ${index}`,
					subClusters: [sub],
					needsReview: index > 0,
					notes: index > 0 ? [`διαχωρίστηκε από ΑΜ ${am} (διαφορετικό πρόσωπο — χρειάζεται έλεγχο)`] : [],
				});
			});
	}

	// --- attach orphans, then code the rest ----------------------------------
	const { orphans, attached } = attachOrphans(clusters, orphanRows, issues);
	stats.orphansAttached = attached;

	const orphansByCode = new Map<string, ClusterRow[]>();
	for (const orphan of orphans) {
		const base = orphan.am.digits || "000";
		const bucket = orphansByCode.get(base);
		if (bucket) bucket.push(orphan);
		else orphansByCode.set(base, [orphan]);
	}
	for (const [base, rows] of [...orphansByCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		const { subClusters } = splitAndMerge(rows);
		subClusters
			.sort((a, b) => (b.rows[0]!.row.date ?? 0) - (a.rows[0]!.row.date ?? 0))
			.forEach((sub, index) => {
				const reason = sub.rows[0]!.am.reason;
				clusters.push({
					am: null,
					splitFromAm: null,
					// 'Ο' marks a true orphan (no usable ΑΜ), 'Σ' a split-off row —
					// the letter keeps the two code families from colliding when a
					// real ΑΜ (999) and a waiting placeholder ('999 - Αναμονή')
					// produce the same numeric base.
					orphanCode: `${base}-Ο${index + 1}`,
					subClusters: [sub],
					needsReview: true,
					notes: [
						reason === "waiting"
							? "εκκρεμής εγγραφή (Αναμονή) — χρειάζεται ΑΜ"
							: reason === "zero"
								? "χωρίς ΑΜ (νέα εγγραφή) — χρειάζεται ΑΜ"
								: `μη έγκυρο ΑΜ '${sub.rows[0]!.am.raw}' — χρειάζεται έλεγχο`,
					],
				});
			});
	}

	// --- build rows ----------------------------------------------------------
	const { pupils, urlConflicts } = buildPupils(clusters, issues, stats);

	for (const [url, owners] of urlConflicts) {
		if (owners.length < 2) continue;
		issues.push({
			code: "registration_url_duplicate",
			detail: `${url} → ${owners.map((owner) => owner.am ?? owner.orphanCode).join(", ")}`,
		});
		for (const owner of owners) {
			owner.registration_url = "";
			owner.reviewNote = [owner.reviewNote, `διπλότυπο registration_url (${url})`].filter(Boolean).join("; ");
			owner.needsReview = 1;
		}
	}

	flagSharedCellphones(pupils, issues);

	return { pupils, issues, stats, urlConflicts };
}

/**
 * How many cards may legitimately share one mobile before it stops looking like
 * a family number. Two or three siblings registered on a parent's mobile is
 * normal; four is already unusual, and the register contains one number sitting
 * on eighteen unrelated cards (school/institution, or a value typed in by
 * mistake). See the module's rule notes.
 */
const SHARED_CELLPHONE_THRESHOLD = 4;

/**
 * Records a review note on every pupil sharing one mobile with too many others.
 *
 * Nothing is merged or moved: the number may be perfectly correct (a school or
 * teacher contact), so the secretaries get a note and a review flag, and decide.
 * The note carries the count, never the number itself — the pupil's own
 * `cellphone` field already shows it.
 */
function flagSharedCellphones(pupils: BuiltPupil[], issues: Issue[]): void {
	const groups = new Map<string, BuiltPupil[]>();
	for (const pupil of pupils) {
		const digits = String(pupil.cellphone ?? "").replace(/\D/g, "");
		if (digits.length < 10) continue;
		const bucket = groups.get(digits);
		if (bucket) bucket.push(pupil);
		else groups.set(digits, [pupil]);
	}
	for (const group of groups.values()) {
		if (group.length < SHARED_CELLPHONE_THRESHOLD) continue;
		for (const pupil of group) {
			pupil.reviewNote = [pupil.reviewNote, `κοινόχρηστο κινητό: ο αριθμός εμφανίζεται σε ${group.length} καρτέλες — ελέγξτε αν είναι σωστός`]
				.filter(Boolean)
				.join("; ");
			pupil.needsReview = 1;
		}
		issues.push({
			code: "shared_cellphone",
			detail: `${group.length} καρτέλες με το ίδιο κινητό: ${group.map((pupil) => pupil.am ?? pupil.orphanCode).join(", ")}`,
		});
	}
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

/** NULL-preserving integer (the legacy `sqlInt`). */
function int(value: number | null | undefined, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/** Text columns are NOT NULL in the schema: null/undefined become ''. */
function text(value: string | null | undefined): string {
	return normalizeText(value);
}

const NOW_MS = "CAST(strftime('%s','now') AS INTEGER) * 1000";

export type ExistingPupils = {
	ams: Set<number>;
	urls: Set<string>;
	orphanCodes: Set<string>;
	nextId: number;
};

/**
 * The exact column order of the generated `pupils` INSERT. `created_at` /
 * `updated_at` are not listed: the statement injects them as SQL expressions
 * (`NOW_MS`), so they are not bound parameters.
 *
 * These lists are the single source of truth for both the INSERT text and the
 * verification digest (scripts/lib/pupilsRun.ts compares the target back against
 * them), so a column added here cannot silently escape verification.
 */
export const PUPIL_INSERT_COLUMNS = [
	"id",
	"am",
	"orphan_code",
	"split_from_am",
	"first_name",
	"last_name",
	"fathers_name",
	"birth_date",
	"road",
	"number",
	"tk",
	"region",
	"telephone",
	"cellphone",
	"email",
	"amka",
	"registration_url",
	"needs_review",
	"review_note",
] as const;

/** Column order of the generated `pupil_enrollments` INSERT (`id` is auto-assigned). */
export const ENROLLMENT_INSERT_COLUMNS = [
	"pupil_id",
	"registration_year",
	"class_id",
	"class_year",
	"teacher_id",
	"instrument_id",
	"date",
	"payment_amount",
	"total_payment",
	"payment_date",
	"pass",
	"source",
] as const;

/** One row as it will be written: its column list plus the bound values, in order. */
export type InsertRow = { columns: readonly string[]; values: (string | number | null)[] };

export type BackfillBatch = {
	statements: SqlStatement[];
	/** The `pupils` rows the statements write, in id order — what verification expects. */
	pupils: InsertRow[];
	/** The `pupil_enrollments` rows the statements write, in insertion order. */
	enrollments: InsertRow[];
	/** Pupils skipped because the target already had their ΑΜ / URL / orphan code. */
	skipped: number;
	/** `UPDATE total_enrollments SET amount = (…)`, always the last statement. */
	counterStatement: SqlStatement;
};

/**
 * Emits the INSERT batch as parameterised statements, together with the exact
 * rows they write.
 *
 * Pupil ids are assigned explicitly (max(id)+1, incrementing) and every
 * enrollment INSERT references its own pupil's id directly.
 *
 * Why not `(SELECT last_insert_rowid())`: replaying the generated batch through
 * the sqlite3 CLI produced 328 enrollments pointing at non-existent pupils, i.e.
 * the subquery did not reliably resolve to the row just inserted. Explicit ids
 * remove the dependency and make the output deterministic and reviewable.
 *
 * `existing` skips pupils already present (idempotent re-runs).
 */
export function buildBatch(pupils: BuiltPupil[], existing: ExistingPupils): BackfillBatch {
	const statements: SqlStatement[] = [];
	const pupilRows: InsertRow[] = [];
	const enrollmentRows: InsertRow[] = [];
	let pupilId = existing.nextId;
	let skipped = 0;
	for (const pupil of pupils) {
		if (pupil.am !== null && existing.ams.has(pupil.am)) {
			skipped++;
			continue;
		}
		if (pupil.orphanCode && existing.orphanCodes.has(pupil.orphanCode)) {
			skipped++;
			continue;
		}
		if (pupil.registration_url && existing.urls.has(pupil.registration_url)) {
			skipped++;
			continue;
		}
		const id = pupilId++;
		const pupilRow: InsertRow = {
			columns: PUPIL_INSERT_COLUMNS,
			values: [
				int(id),
				pupil.am,
				text(pupil.orphanCode),
				pupil.splitFromAm,
				text(pupil.first_name),
				text(pupil.last_name),
				text(pupil.fathers_name),
				int(pupil.birth_date),
				text(pupil.road),
				int(pupil.number),
				int(pupil.tk),
				text(pupil.region),
				text(pupil.telephone),
				text(pupil.cellphone),
				text(pupil.email),
				text(pupil.amka),
				text(pupil.registration_url),
				int(pupil.needsReview),
				text(pupil.reviewNote),
			],
		};
		pupilRows.push(pupilRow);
		statements.push({
			sql:
				`INSERT INTO pupils (${PUPIL_INSERT_COLUMNS.join(", ")}, created_at, updated_at) VALUES (` +
				Array.from({ length: PUPIL_INSERT_COLUMNS.length }, () => "?").join(", ") +
				`, ${NOW_MS}, ${NOW_MS});`,
			params: pupilRow.values,
		});
		for (const enrollment of pupil.enrollments) {
			const enrollmentRow: InsertRow = {
				columns: ENROLLMENT_INSERT_COLUMNS,
				values: [
					int(id),
					text(enrollment.registration_year),
					int(enrollment.class_id),
					text(enrollment.class_year),
					int(enrollment.teacher_id, -1),
					int(enrollment.instrument_id),
					int(enrollment.date),
					int(enrollment.payment_amount),
					int(enrollment.total_payment),
					enrollment.payment_date,
					int(enrollment.pass),
					"migration",
				],
			};
			enrollmentRows.push(enrollmentRow);
			statements.push({
				sql:
					`INSERT INTO pupil_enrollments (${ENROLLMENT_INSERT_COLUMNS.join(", ")}, created_at) VALUES (` +
					Array.from({ length: ENROLLMENT_INSERT_COLUMNS.length }, () => "?").join(", ") +
					`, ${NOW_MS});`,
				params: enrollmentRow.values,
			});
		}
	}
	const counterStatement: SqlStatement = { sql: `UPDATE total_enrollments SET amount = (SELECT COUNT(*) FROM pupil_enrollments);` };
	statements.push(counterStatement);
	return { statements, pupils: pupilRows, enrollments: enrollmentRows, skipped, counterStatement };
}

/** The INSERT batch alone (the statement list `buildBatch` produces, unchanged). */
export function buildStatements(pupils: BuiltPupil[], existing: ExistingPupils): SqlStatement[] {
	return buildBatch(pupils, existing).statements;
}

/**
 * Renders a statement with its parameters inlined, for the audit dump
 * (`MIGRATE_DUMP_SQL`). Nothing in the apply path uses this — the live write
 * always binds parameters.
 */
export function renderStatement(statement: SqlStatement): string {
	const params = statement.params ?? [];
	let index = 0;
	const sql = statement.sql.replace(/\?/g, () => {
		const value = params[index++];
		if (value === null || value === undefined) return "NULL";
		if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
		return `'${String(value).replaceAll("'", "''")}'`;
	});
	return sql;
}

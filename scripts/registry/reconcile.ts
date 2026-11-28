/**
 * Matching the Μαθητολόγιο to the school's «Γενικό Μητρώο» — the pure plan behind `scripts/registryReconcile.ts`.
 *
 * The register (one row per ΑΜ, 1 … N, no gaps) is the authority on who holds which ΑΜ. This module compares it with
 * the pupils in the database and returns the changes that make them agree:
 *
 *  1. **Decisions** the principal made on the cases the data cannot settle (`Decisions`, from the gitignored
 *     school_registry/reconcile-decisions.json; each checked against the
 *     names it expects; a case whose records look different is skipped and reported, never guessed).
 *  2. **Register numbers**: a pupil without ΑΜ whose identity strictly matches a register entry whose ΑΜ nobody in the
 *     database holds gets that ΑΜ ("strictly": the spelling-tolerant `samePerson` plus the same father's name and
 *     birth year — on the names alone, two different people with similar surnames matched).
 *  3. **New numbers**: every other pupil without ΑΜ (with at least one enrollment, not a test fixture) gets one, in
 *     the order they first enrolled: the numbers nobody holds (freed by the principal, or never given) go to the first pupils of the
 *     current school year, then N+1, N+2, … for everyone.
 *  4. **Clean-up**: a pupil with an ΑΜ loses the «000-Ο…» code and the "ΑΜ pending" parts of its review note; the
 *     review flag stays only while something else in the note still needs a look.
 *
 * No I/O: the runner reads the workbook and the database, applies the plan as SQL.
 */
import { formalGivenName, nameKey, samePerson } from "./parse";

export type RegisterEntry = { am: number; surname: string; name: string; father: string; born: number | null };

export type DbPupil = {
	id: number;
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	last_name: string;
	first_name: string;
	fathers_name: string;
	/** Birth year (UTC). */
	born: number | null;
	amka: string;
	email: string;
	review_note: string;
	needs_review: boolean;
};

export type DbEnrollment = { id: number; pupil_id: number; registration_year: string; date: number };

type Person = { surname: string; name: string };

/**
 * The principal's decisions on the cases the data cannot settle. They name real pupils, so they live in the
 * gitignored `school_registry/reconcile-decisions.json` (the runner loads it), never in the code. Every case names the
 * records it expects to find.
 */
export type Decisions = {
	/** The same person under the wrong ΑΜ: moves to the register's number. */
	moves: ({ from: number; to: number } & Person)[];
	/** The register's person replaces whoever holds the number, who then gets a new number like any pupil without ΑΜ. */
	replace: { am: number; holder: Person; by: { am: number } & Person }[];
	/**
	 * One record that is two people: the register's person (a child) keeps the ΑΜ and the enrollments of `keepYears`;
	 * the person on the record (the parent, enrolled in their own right) moves to a new record with the other
	 * enrollments and a new number. The ΑΜΚΑ on file goes with whoever it belongs to (its 5th-6th digits are the birth year).
	 */
	splits: { am: number; holder: Person; keepYears: string[] }[];
	/** Two records of one person: `from` is merged into `into`, which takes the corrected name. */
	merges: ({ from: number; into: number } & Person)[];
	/** ΑΜs the principal freed (also found by `planReconcile` itself, as any register number nobody holds). */
	freed: number[];
	/** The database is right and the register is not: reported for the principal's register, nothing changes. */
	registerFixes: { am: number; text: string }[];
};

export const NO_DECISIONS: Decisions = { moves: [], replace: [], splits: [], merges: [], freed: [], registerFixes: [] };

const sameName = (p: { last_name: string; first_name: string }, surname: string, name: string) =>
	samePerson({ surname: p.last_name, name: p.first_name }, { surname, name });

/** The same person, strictly: tolerant spelling of the names, but the same father's name and birth year. */
export function strictlySamePerson(p: DbPupil, r: RegisterEntry): boolean {
	if (!samePerson({ surname: p.last_name, name: p.first_name }, { surname: r.surname, name: r.name })) return false;
	const fatherOk = !!p.fathers_name && !!r.father && formalGivenName(nameKey(p.fathers_name)) === formalGivenName(nameKey(r.father));
	return fatherOk && p.born !== null && p.born === r.born;
}

/** Whether an ΑΜΚΑ belongs to someone born in `year` (digits 5-6 are the two-digit birth year). */
export const amkaOfYear = (amka: string, year: number | null) =>
	year !== null && /^\d{11}$/.test(amka) && amka.slice(4, 6) === String(year % 100).padStart(2, "0");

// ---- Review notes ----

/** The parts of a review note that only say "this pupil has no (valid) ΑΜ yet". */
const PENDING_AM = [
	/χωρίς ΑΜ[^·]*?(?:εκκρεμεί απονομή ΑΜ|χρειάζεται ΑΜ)/g,
	/μη έγκυρο ΑΜ '[^']*' (?:—|:|-) χρειάζεται έλεγχο/g,
	/Στο Γενικό Μητρώο με (?:το )?ΑΜ \d+(?:, που είναι γραμμένο και σε άλλο άτομο \([^)]*\) (?:—|:|-) χρειάζεται νέο ΑΜ)?/g,
	// The backfill's notes on the register's duplicates, which the new register and this plan resolve.
	/Το ΑΜ \d+ είναι γραμμένο και σε άλλο άτομο στο Γενικό Μητρώο \([^)]*\)(?: (?:—|:|-) εκείνο καταχωρίστηκε ως [^\s·]+)?/g,
	/Πιθανή διπλή εγγραφή στο Γενικό Μητρώο: ίδιο άτομο με ΑΜ \d+/g,
];
/** A placement the backfill inferred: information only, never a reason to flag. */
const ESTIMATE = /^Κατάταξη \d{4}-\d{4} \([^)]*\): εκτίμηση από το ιστορικό του Excel$/;

/** The note without its "ΑΜ pending" parts, and whether the rest still needs the secretaries. */
export function cleanReviewNote(note: string, flagged: boolean): { note: string; needsReview: boolean } {
	let text = note;
	for (const pattern of PENDING_AM) text = text.replace(pattern, " ");
	const parts = text
		.split(/\s*·\s*/)
		.map((part) => part.replace(/^[\s,.!:;-]+|[\s,.:;-]+$/g, "").replace(/\s{2,}/g, " "))
		.filter(Boolean);
	return { note: parts.join(" · "), needsReview: flagged && parts.some((part) => !ESTIMATE.test(part)) };
}

// ---- The plan ----

export type Assignment = { pupilId: number; from: number | null; to: number; why: string };
export type Plan = {
	/** Every pupil whose ΑΜ changes (the runner clears them all first, so the unique index never trips). */
	assignments: Assignment[];
	splits: { pupilId: number; childAm: number; child: RegisterEntry; moveEnrollmentIds: number[]; parentAm: number; amkaToParent: boolean }[];
	merges: { fromId: number; intoId: number; surname: string; name: string; enrollmentIds: number[] }[];
	/** Pupils whose code / note / flag change (also every pupil in `assignments`). */
	cleanups: { pupilId: number; review_note: string; needs_review: boolean }[];
	/** Pupils left without ΑΜ, and why. */
	skipped: { pupilId: number; why: string }[];
	/** Decisions whose records did not look as expected (nothing done for them). */
	problems: string[];
	/** Decisions an earlier run already applied. */
	done: string[];
	/** The register's ΑΜ that end up with no pupil, and the next free number. */
	nextAm: number;
};

export type PlanInput = {
	register: RegisterEntry[];
	pupils: DbPupil[];
	enrollments: DbEnrollment[];
	/** The current school year ("2026-2027"): its new pupils take the freed numbers. */
	currentYear: string;
	/** Pupils never numbered: test fixtures. */
	isTestPupil: (p: DbPupil) => boolean;
	decisions?: Decisions;
};

export function planReconcile({ register, pupils, enrollments, currentYear, isTestPupil, decisions = NO_DECISIONS }: PlanInput): Plan {
	const plan: Plan = { assignments: [], splits: [], merges: [], cleanups: [], skipped: [], problems: [], done: [], nextAm: 0 };
	const regByAm = new Map(register.map((r) => [r.am, r]));
	/** The ΑΜ each pupil will hold (starts as today's). */
	const amOf = new Map(pupils.map((p) => [p.id, p.am]));
	const holderOf = (am: number) => pupils.find((p) => amOf.get(p.id) === am);
	const enrollmentsOf = (id: number) => enrollments.filter((e) => e.pupil_id === id);
	const assign = (p: DbPupil, to: number, why: string) => {
		plan.assignments.push({ pupilId: p.id, from: p.am, to, why });
		amOf.set(p.id, to);
	};
	/** Pupils that still need a number at the end, with the date they first enrolled. */
	const needNumber = new Map<number, { firstDate: number; firstYear: string; why: string }>();
	const firstOf = (list: DbEnrollment[]) => {
		const sorted = [...list].sort((a, b) => a.date - b.date || a.id - b.id);
		return { firstDate: sorted[0]?.date ?? Number.MAX_SAFE_INTEGER, firstYear: [...list].map((e) => e.registration_year).sort()[0] ?? "" };
	};

	// 1. Decisions.
	for (const m of decisions.moves) {
		const p = holderOf(m.from);
		const there = holderOf(m.to);
		if (there && sameName(there, m.surname, m.name)) plan.done.push(`${m.surname} ${m.name}: ΑΜ ${m.to}`);
		else if (!p || !sameName(p, m.surname, m.name))
			plan.problems.push(`Μετακίνηση ${m.from}→${m.to}: στο ΑΜ ${m.from} δεν είναι ο/η ${m.surname} ${m.name}`);
		else if (holderOf(m.to)) plan.problems.push(`Μετακίνηση ${m.from}→${m.to}: το ΑΜ ${m.to} το έχει ήδη άλλος μαθητής`);
		else assign(p, m.to, `το ΑΜ της στο Γενικό Μητρώο είναι ${m.to}`);
	}
	for (const r of decisions.replace) {
		const holder = holderOf(r.am);
		const by = holderOf(r.by.am);
		if (holder && sameName(holder, r.by.surname, r.by.name)) {
			plan.done.push(`${r.by.surname} ${r.by.name}: ΑΜ ${r.am}`);
			continue;
		}
		if (!holder || !sameName(holder, r.holder.surname, r.holder.name) || !by || !sameName(by, r.by.surname, r.by.name)) {
			plan.problems.push(
				`ΑΜ ${r.am}: δεν βρέθηκαν όπως αναμένονταν οι ${r.holder.surname} ${r.holder.name} (ΑΜ ${r.am}) και ${r.by.surname} ${r.by.name} (ΑΜ ${r.by.am})`,
			);
			continue;
		}
		amOf.set(holder.id, null);
		needNumber.set(holder.id, {
			...firstOf(enrollmentsOf(holder.id)),
			why: `είχε το ΑΜ ${r.am}, που στο Γενικό Μητρώο ανήκει στον/στην ${r.by.surname} ${r.by.name}`,
		});
		assign(by, r.am, `το ΑΜ του/της στο Γενικό Μητρώο (είχε ${r.by.am})`);
	}
	const splitParents: {
		pupilId: number;
		childAm: number;
		child: RegisterEntry;
		moveEnrollmentIds: number[];
		amkaToParent: boolean;
		firstDate: number;
		firstYear: string;
	}[] = [];
	for (const s of decisions.splits) {
		const p = holderOf(s.am);
		const child = regByAm.get(s.am);
		const move = p ? enrollmentsOf(p.id).filter((e) => !s.keepYears.includes(e.registration_year)) : [];
		if (p && child && sameName(p, child.surname, child.name)) {
			plan.done.push(`ΑΜ ${s.am}: ${child.surname} ${child.name}`);
			continue;
		}
		if (!p || !child || !sameName(p, s.holder.surname, s.holder.name) || !move.length) {
			plan.problems.push(
				`Διαχωρισμός ΑΜ ${s.am}: η εγγραφή δεν είναι όπως αναμενόταν (${s.holder.surname} ${s.holder.name} με εγγραφές εκτός ${s.keepYears.join(", ")})`,
			);
			continue;
		}
		splitParents.push({
			pupilId: p.id,
			childAm: s.am,
			child,
			moveEnrollmentIds: move.map((e) => e.id),
			amkaToParent: amkaOfYear(p.amka, p.born),
			...firstOf(move),
		});
	}
	for (const m of decisions.merges) {
		const from = holderOf(m.from);
		const into = holderOf(m.into);
		if (into && nameKey(into.last_name) === nameKey(m.surname) && (!from || !sameName(from, m.surname, m.name))) {
			plan.done.push(`ΑΜ ${m.into}: ${m.surname} ${m.name} (συγχωνευμένο)`);
			continue;
		}
		if (!from || !into || !sameName(from, m.surname, m.name) || !sameName(into, m.surname, m.name)) {
			plan.problems.push(`Συγχώνευση ${m.from}→${m.into}: δεν βρέθηκαν και τα δύο ως ${m.surname} ${m.name}`);
			continue;
		}
		plan.merges.push({ fromId: from.id, intoId: into.id, surname: m.surname, name: m.name, enrollmentIds: enrollmentsOf(from.id).map((e) => e.id) });
		amOf.set(from.id, null);
	}
	const mergedAway = new Set(plan.merges.map((m) => m.fromId));

	// 1b. A pupil on someone else's ΑΜ (e.g. the second number of a duplicate, which the register gave to a new pupil)
	// moves to their own: the one register entry they strictly match that nobody holds. Repeated, since a move frees a
	// number another pupil may be waiting for.
	const decided = new Set([...plan.assignments.map((a) => a.pupilId), ...needNumber.keys(), ...splitParents.map((s) => s.pupilId), ...mergedAway]);
	for (let moved = true; moved;) {
		moved = false;
		for (const p of pupils) {
			const am = amOf.get(p.id);
			if (am === null || am === undefined || decided.has(p.id)) continue;
			const own = regByAm.get(am);
			if (!own || samePerson({ surname: p.last_name, name: p.first_name }, { surname: own.surname, name: own.name })) continue;
			const matches = register.filter((r) => !holderOf(r.am) && !decisions.freed.includes(r.am) && strictlySamePerson(p, r));
			if (matches.length !== 1) continue;
			assign(p, matches[0].am, `το ΑΜ ${am} στο Γενικό Μητρώο είναι άλλου· το δικό του/της είναι ${matches[0].am}`);
			decided.add(p.id);
			moved = true;
		}
	}

	// 2. Register numbers for pupils without ΑΜ.
	for (const p of pupils) {
		if (amOf.get(p.id) !== null || mergedAway.has(p.id) || needNumber.has(p.id)) continue;
		const matches = register.filter((r) => !holderOf(r.am) && !decisions.freed.includes(r.am) && strictlySamePerson(p, r));
		if (matches.length === 1) assign(p, matches[0].am, "βρέθηκε στο Γενικό Μητρώο");
		else if (matches.length > 1)
			plan.skipped.push({ pupilId: p.id, why: `ταιριάζει με περισσότερα ΑΜ του Γενικού Μητρώου (${matches.map((r) => r.am).join(", ")})` });
	}

	// 3. New numbers, in the order the pupils first enrolled.
	for (const p of pupils) {
		if (amOf.get(p.id) !== null || mergedAway.has(p.id) || needNumber.has(p.id) || plan.skipped.some((s) => s.pupilId === p.id)) continue;
		if (isTestPupil(p)) continue;
		const own = enrollmentsOf(p.id);
		if (!own.length) {
			plan.skipped.push({ pupilId: p.id, why: "χωρίς καμία εγγραφή" });
			continue;
		}
		needNumber.set(p.id, { ...firstOf(own), why: "νέος μαθητής" });
	}
	const queue = [
		...[...needNumber].map(([id, info]) => ({ kind: "pupil" as const, id, ...info })),
		...splitParents.map((s) => ({
			kind: "parent" as const,
			id: s.pupilId,
			firstDate: s.firstDate,
			firstYear: s.firstYear,
			why: `χωρίστηκε από το ΑΜ ${s.childAm}`,
		})),
	].sort((a, b) => a.firstDate - b.firstDate || a.id - b.id);
	// The numbers the principal freed, and any number up to the register's last that has no register entry, go to the
	// current year's new pupils first, like `NEXT_AM_SQL` does for every new pupil: the register keeps no gaps. A register
	// number of a real register person that nobody holds is never given away (that person may not be in the database
	// yet): it is reported instead.
	const registerMax = Math.max(0, ...register.map((r) => r.am));
	const gaps = new Set<number>(decisions.freed);
	for (let am = 1; am <= registerMax; am++) if (!regByAm.has(am)) gaps.add(am);
	const freed = [...gaps].filter((am) => !holderOf(am)).sort((a, b) => a - b);
	for (const r of register)
		if (!holderOf(r.am) && !gaps.has(r.am))
			plan.problems.push(`Το ΑΜ ${r.am} του Γενικού Μητρώου (${r.surname} ${r.name}) δεν το έχει κανείς μαθητής της βάσης`);
	// New numbers continue the register's sequence, skipping numbers already held above it (an earlier run's).
	const held = new Set([...amOf.values()].filter((am): am is number => am !== null));
	let next = registerMax + 1;
	const takeNext = () => {
		while (held.has(next)) next++;
		held.add(next);
		return next++;
	};
	const numbers = new Map<(typeof queue)[number], number>();
	for (const item of queue) if (freed.length && item.firstYear === currentYear) numbers.set(item, freed.shift()!);
	for (const item of queue) if (!numbers.has(item)) numbers.set(item, takeNext());
	for (const item of queue) {
		const am = numbers.get(item)!;
		if (item.kind === "pupil")
			assign(
				pupils.find((p) => p.id === item.id)!,
				am,
				item.why,
			);
		else {
			const s = splitParents.find((x) => x.pupilId === item.id)!;
			plan.splits.push({
				pupilId: s.pupilId,
				childAm: s.childAm,
				child: s.child,
				moveEnrollmentIds: s.moveEnrollmentIds,
				parentAm: am,
				amkaToParent: s.amkaToParent,
			});
		}
	}
	while (held.has(next)) next++;
	plan.nextAm = next;
	for (const am of [...held].filter((am) => am > next && am < 9000).sort((a, b) => a - b))
		plan.problems.push(`Το ΑΜ ${am} είναι εκτός της σειράς (το επόμενο ελεύθερο είναι ${next}): ελέγξτε τον μαθητή`);
	for (const am of freed) plan.problems.push(`Το ελεύθερο ΑΜ ${am} δεν δόθηκε (δεν υπάρχει νέος μαθητής της χρονιάς ${currentYear})`);

	// 4. Clean-up of every pupil that holds (or now gets) an ΑΜ.
	const assigned = new Set(plan.assignments.map((a) => a.pupilId));
	for (const p of pupils) {
		if (mergedAway.has(p.id) || amOf.get(p.id) === null) continue;
		const cleaned = cleanReviewNote(p.review_note, p.needs_review);
		const changes =
			assigned.has(p.id) || p.orphan_code !== "" || p.split_from_am !== null || cleaned.note !== p.review_note || cleaned.needsReview !== p.needs_review;
		if (changes) plan.cleanups.push({ pupilId: p.id, review_note: cleaned.note, needs_review: cleaned.needsReview });
	}
	return plan;
}

/**
 * «Επαφές Google» — what the school account's contacts should look like, and how to get there from what
 * is there now. Pure functions (no DB, no network), client-safe and unit-tested (tests/unit/contactsPlan.test.ts).
 *
 * Why the old yearly `.vcf` imports went wrong, and what this does instead:
 * - One contact per PHONE NUMBER, not per pupil. The phone shows one name per number; siblings (or a parent
 *   and child) on one number become one contact naming all of them («Παπαδόπουλος Γιώργος, Μαρία»).
 * - A number shared by more than `MAX_PUPILS_PER_NUMBER` pupils is not family: it is a placeholder or a
 *   teacher's/the school's number typed into the form. It is left out and reported for the Μαθητολόγιο.
 * - Every contact the sync manages carries its phone key (`clientData`) and the «Σχολή · Μαθητολόγιο»
 *   label, so a later run updates it instead of adding a copy, and removes it when the number leaves the
 *   register. Contacts without them are never changed, except an earlier import of the same number
 *   («adopted» once, or reported as a duplicate): one holding no other number, or one named after a pupil
 *   on that number (an old import that kept a number the register has since changed).
 */

import { normalizeKey } from "@lib/pupils/normalize";

/** Pupils on one number above this are not a family (see above). */
export const MAX_PUPILS_PER_NUMBER = 3;

/** `clientData` key holding a managed contact's phone key. */
export const CLIENT_DATA_KEY = "byz_register_phone";

export type GroupKey = "managed" | "byz" | "par" | "eur" | "current" | "teachers";

/** The contact labels the sync owns. Labels the school adds itself are kept as they are. */
export const GROUP_NAMES: Record<GroupKey, string> = {
	managed: "Σχολή · Μαθητολόγιο",
	byz: "Σχολή · Βυζαντινή",
	par: "Σχολή · Παραδοσιακή",
	eur: "Σχολή · Ευρωπαϊκή",
	current: "Σχολή · Φετινοί μαθητές",
	teachers: "Σχολή · Καθηγητές",
};
export const GROUP_KEYS = Object.keys(GROUP_NAMES) as GroupKey[];

const CLASS_GROUP: Record<number, GroupKey> = { 0: "byz", 1: "par", 2: "eur" };
const CLASS_LABEL: Record<number, string> = { 0: "Βυζαντινή", 1: "Παραδοσιακή", 2: "Ευρωπαϊκή" };

/** First line of a managed contact's note. */
export const NOTE_HEADER = "Μαθητολόγιο Σχολής — ενημερώνεται αυτόματα, οι αλλαγές εδώ θα αντικατασταθούν.";

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

/**
 * One phone as an E.164-style key, or "" when it is not a usable number.
 * Greek numbers (10 digits, 2… landline / 6… mobile, with or without +30 / 0030) → "+30XXXXXXXXXX";
 * anything else with 8–15 digits → "+<digits>".
 */
export function phoneKey(raw: string | null | undefined): string {
	if (!raw) return "";
	const hadPlus = raw.trim().startsWith("+");
	let digits = raw.replace(/\D/g, "");
	if (digits.startsWith("0030")) digits = digits.slice(4);
	else if (digits.startsWith("30") && digits.length === 12) digits = digits.slice(2);
	else if (digits.startsWith("00")) digits = digits.slice(2);
	if (digits.length === 10 && /^[26]/.test(digits)) return `+30${digits}`;
	if ((hadPlus || raw.trim().startsWith("00")) && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
	return "";
}

/**
 * Every number in a register field. Legacy rows sometimes hold two numbers in one field
 * («6912345678 / 6987654321», «6912345678 6987654321»); the first one is the main number.
 */
export function phoneKeys(raw: string | null | undefined): string[] {
	if (!raw || raw.trim() === "-") return [];
	const whole = phoneKey(raw);
	if (whole) return [whole];
	const parts = raw
		.split(/[\/,;|]|\s-\s|\s{2,}/)
		.flatMap((part) => (part.replace(/\D/g, "").length >= 20 ? part.trim().split(/\s+/) : [part]))
		.map(phoneKey)
		.filter(Boolean);
	if (parts.length) return [...new Set(parts)];
	// Two 10-digit Greek numbers glued together.
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 20) return [...new Set([phoneKey(digits.slice(0, 10)), phoneKey(digits.slice(10))].filter(Boolean))];
	return [];
}

/** "+306912345678" → "691 234 5678" for display. */
export function formatPhone(key: string): string {
	const m = /^\+30(\d{3})(\d{3})(\d{4})$/.exec(key);
	return m ? `${m[1]} ${m[2]} ${m[3]}` : key;
}

// ---------------------------------------------------------------------------
// Desired contacts
// ---------------------------------------------------------------------------

/** One pupil as `GoogleContacts` reads it from the register. */
export type RegisterPupil = {
	id: number;
	/** ΑΜ, or the review code of a pupil without one ('000-Ο1'). */
	am: string;
	first_name: string;
	last_name: string;
	cellphone: string;
	telephone: string;
	email: string;
	/** class_id of every enrollment (0 Βυζαντινή, 1 Παραδοσιακή, 2 Ευρωπαϊκή). */
	classes: number[];
	/** Latest school year enrolled ("2026-2027"), or "" without enrollments. */
	last_year: string;
	/** Enrolled in the current school year. */
	current: boolean;
};

/** One teacher as `GoogleContacts` reads it (`teachers` + `teacher_classes`). `fullname` is «Όνομα Επώνυμο». */
export type RegisterTeacher = {
	id: number;
	fullname: string;
	telephone: string;
	email: string;
	/** 0 Καθηγητής, 1 Δάσκαλος, 2 Επιμελητής. */
	title: number;
	gender: string;
	/** class_id of the departments they teach. */
	classes: number[];
};

export type DesiredPhone = { key: string; type: "mobile" | "home" };

export type DesiredContact = {
	key: string;
	givenName: string;
	familyName: string;
	phones: DesiredPhone[];
	emails: string[];
	note: string;
	groups: GroupKey[];
	/** Who is on this number, for the preview: «Καθηγητής: Όνομα Επώνυμο», «Επώνυμο Όνομα (ΑΜ 706)». */
	people: string[];
	/** `nameKey` of each teacher and pupil, to recognise an old import named after one of them. */
	nameKeys: string[];
};

export type ExcludedNumber = { key: string; pupils: string[] };

export type DesiredResult = {
	contacts: DesiredContact[];
	/** Numbers shared by too many pupils (left out). */
	excluded: ExcludedNumber[];
	/** Pupils and teachers without any usable number. */
	noPhone: string[];
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const pupilLabel = (p: RegisterPupil) => `${clean(p.last_name)} ${clean(p.first_name)} (ΑΜ ${p.am || "—"})`;

/** «Καθηγητής», «Καθηγήτρια», «Δάσκαλος», «Δασκάλα», «Επιμελητής», «Επιμελήτρια». */
export function teacherTitle(t: Pick<RegisterTeacher, "title" | "gender">): string {
	const female = t.gender === "F";
	if (t.title === 1) return female ? "Δασκάλα" : "Δάσκαλος";
	if (t.title === 2) return female ? "Επιμελήτρια" : "Επιμελητής";
	return female ? "Καθηγήτρια" : "Καθηγητής";
}
const teacherLabel = (t: RegisterTeacher) => `${teacherTitle(t)}: ${clean(t.fullname)}`;

/** «Όνομα Επώνυμο» → given/family: the last word is the surname. */
export function splitFullname(fullname: string): { first: string; last: string } {
	const words = clean(fullname).split(" ");
	return words.length < 2 ? { first: words[0] ?? "", last: "" } : { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}
const collator = new Intl.Collator("el", { sensitivity: "base" });

/** Order-, accent- and case-insensitive name key: «ΠΑΠΑΔΟΠΟΥΛΟΣ Γιώργος» = «Γιώργος Παπαδόπουλος». */
export const nameKey = (name: string) =>
	normalizeKey(name)
		.split(/[\s,]+/)
		.filter(Boolean)
		.sort()
		.join(" ");
const sameText = (a: string, b: string) => collator.compare(a, b) === 0;

/** Contact name for the pupils on one number. */
export function contactName(pupils: Pick<RegisterPupil, "first_name" | "last_name">[]): { givenName: string; familyName: string } {
	const people = pupils.map((p) => ({ first: clean(p.first_name), last: clean(p.last_name) }));
	const firsts = [...new Map(people.map((p) => [p.first.toLocaleLowerCase("el"), p.first])).values()];
	if (people.every((p) => sameText(p.last, people[0].last))) return { givenName: firsts.join(", "), familyName: people[0].last };
	return { givenName: people.map((p) => `${p.first} ${p.last}`).join(" & "), familyName: "" };
}

const classList = (classes: number[]) =>
	[...new Set(classes)]
		.sort()
		.map((c) => CLASS_LABEL[c])
		.filter(Boolean)
		.join(", ");

function noteFor(teachers: RegisterTeacher[], pupils: RegisterPupil[]): string {
	const teacherLines = teachers.map((t) => {
		const classes = classList(t.classes);
		return `• ${teacherTitle(t)}: ${clean(t.fullname)}${classes ? ` — ${classes}` : ""}`;
	});
	const pupilLines = pupils.map((p) => {
		const classes = classList(p.classes);
		return `• ${clean(p.last_name)} ${clean(p.first_name)} — ΑΜ ${p.am || "—"}${classes ? ` — ${classes}` : ""}${p.last_year ? ` — τελευταία εγγραφή ${p.last_year}` : ""}`;
	});
	return [NOTE_HEADER, ...teacherLines, ...(teacherLines.length && pupilLines.length ? ["Μαθητές:"] : []), ...pupilLines].join("\n");
}

/** The contact's name: the teacher's (it is their phone), otherwise the pupils'. */
function entryName(teachers: RegisterTeacher[], pupils: RegisterPupil[]) {
	if (!teachers.length) return contactName(pupils);
	return contactName(teachers.map((t) => splitFullname(t.fullname)).map(({ first, last }) => ({ first_name: first, last_name: last })));
}

/**
 * The contacts the school account should hold for this register and these teachers.
 *
 * A number with a teacher on it is the teacher's contact (named after them, labelled «Καθηγητές»), and the
 * pupils who gave the same number are listed in its note — often the teacher themself, also enrolled, or
 * their child. A teacher's number is never left out as "shared by too many pupils".
 */
export function buildDesiredContacts(register: RegisterPupil[], teachers: RegisterTeacher[] = [], maxPerNumber = MAX_PUPILS_PER_NUMBER): DesiredResult {
	type Entry = { pupils: RegisterPupil[]; teachers: RegisterTeacher[]; home: Set<string> };
	const byKey = new Map<string, Entry>();
	const noPhone: string[] = [];
	const entryOf = (key: string) => {
		const entry = byKey.get(key) ?? { pupils: [], teachers: [], home: new Set<string>() };
		byKey.set(key, entry);
		return entry;
	};
	for (const pupil of register) {
		const numbers = [...phoneKeys(pupil.cellphone), ...phoneKeys(pupil.telephone)];
		if (!numbers.length) {
			noPhone.push(pupilLabel(pupil));
			continue;
		}
		const entry = entryOf(numbers[0]);
		entry.pupils.push(pupil);
		for (const extra of numbers.slice(1)) if (extra !== numbers[0]) entry.home.add(extra);
	}
	for (const teacher of teachers) {
		const numbers = phoneKeys(teacher.telephone);
		if (!numbers.length) {
			noPhone.push(teacherLabel(teacher));
			continue;
		}
		const entry = entryOf(numbers[0]);
		entry.teachers.push(teacher);
		for (const extra of numbers.slice(1)) if (extra !== numbers[0]) entry.home.add(extra);
	}

	const contacts: DesiredContact[] = [];
	const excluded: ExcludedNumber[] = [];
	for (const [key, entry] of byKey) {
		const pupils = [...entry.pupils].sort((a, b) => collator.compare(clean(a.first_name), clean(b.first_name)) || a.id - b.id);
		const staff = [...entry.teachers].sort((a, b) => collator.compare(clean(a.fullname), clean(b.fullname)) || a.id - b.id);
		if (!staff.length && pupils.length > maxPerNumber) {
			excluded.push({ key, pupils: pupils.map(pupilLabel) });
			continue;
		}
		const groups = new Set<GroupKey>(["managed"]);
		if (staff.length) groups.add("teachers");
		for (const p of pupils) {
			for (const c of p.classes) if (CLASS_GROUP[c]) groups.add(CLASS_GROUP[c]);
			if (p.current) groups.add("current");
		}
		const emails = [
			...new Map(
				[...staff.map((t) => t.email), ...pupils.map((p) => p.email)]
					.map((e) => clean(e).toLowerCase())
					.filter((e) => e.includes("@"))
					.map((e) => [e, e]),
			).values(),
		];
		contacts.push({
			key,
			...entryName(staff, pupils),
			phones: [
				{ key, type: "mobile" },
				...[...entry.home]
					.filter((h) => h !== key)
					.sort()
					.map((h) => ({ key: h, type: "home" as const })),
			],
			emails,
			note: noteFor(staff, pupils),
			groups: GROUP_KEYS.filter((g) => groups.has(g)),
			people: [...staff.map(teacherLabel), ...pupils.map(pupilLabel)],
			nameKeys: [...staff.map((t) => nameKey(t.fullname)), ...pupils.map((p) => nameKey(`${p.first_name} ${p.last_name}`))],
		});
	}
	contacts.sort((a, b) => collator.compare(`${a.familyName} ${a.givenName}`, `${b.familyName} ${b.givenName}`) || a.key.localeCompare(b.key));
	excluded.sort((a, b) => b.pupils.length - a.pupils.length || a.key.localeCompare(b.key));
	return { contacts, excluded, noPhone };
}

// ---------------------------------------------------------------------------
// Diff against the account's contacts
// ---------------------------------------------------------------------------

/** A contact of the account, reduced to what the sync compares (lib/contacts/people.server.ts). */
export type ExistingContact = {
	resourceName: string;
	etag: string;
	displayName: string;
	givenName: string;
	familyName: string;
	/** Phone keys (`phoneKey`) with their type. */
	phones: DesiredPhone[];
	/** Numbers that did not parse: they make the contact "not ours to touch". */
	unparsedPhones: number;
	emails: string[];
	note: string;
	/** Contact group resource names it belongs to. */
	groups: string[];
	/** `clientData[CLIENT_DATA_KEY]` — set on contacts this sync created or adopted. */
	managedKey: string | null;
};

export type ContactUpdate = {
	resourceName: string;
	etag: string;
	/** The name it has now (what the preview shows as «από»). */
	from: string;
	/** An earlier import taken over by the sync (not managed until now). */
	adopted: boolean;
	desired: DesiredContact;
	/** Which parts change: name, phones, emails, note, labels. */
	changes: string[];
};

export type ContactRemoval = { resourceName: string; name: string; phones: string[] };

export type ContactsPlan = {
	create: DesiredContact[];
	update: ContactUpdate[];
	unchanged: number;
	/** Managed contacts whose number is no longer in the register (or is now excluded). */
	remove: ContactRemoval[];
	/** Extra copies of a register number (earlier imports, or managed doubles). Removed only when asked. */
	duplicates: ContactRemoval[];
	excluded: ExcludedNumber[];
	noPhone: string[];
	/** Not-managed contacts sharing a register number that hold other numbers too: never touched. */
	untouchedShared: ContactRemoval[];
};

const displayOf = (c: ExistingContact) => c.displayName || [c.givenName, c.familyName].filter(Boolean).join(" ") || "(χωρίς όνομα)";
const removalOf = (c: ExistingContact): ContactRemoval => ({
	resourceName: c.resourceName,
	name: displayOf(c),
	phones: c.phones.map((p) => formatPhone(p.key)),
});
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** What changes between an existing contact and its desired state. `groupIds`: GroupKey → resource name. */
export function contactChanges(existing: ExistingContact, desired: DesiredContact, groupIds: Record<GroupKey, string>): string[] {
	const changes: string[] = [];
	if (existing.givenName !== desired.givenName || existing.familyName !== desired.familyName) changes.push("όνομα");
	const phonesOf = (phones: DesiredPhone[]) => phones.map((p) => `${p.key}:${p.type}`);
	if (!sameSet(phonesOf(existing.phones), phonesOf(desired.phones))) changes.push("τηλέφωνα");
	if (!sameSet(existing.emails, desired.emails)) changes.push("email");
	if (existing.note !== desired.note) changes.push("σημείωση");
	const ownGroups = new Set(Object.values(groupIds));
	const managedGroups = existing.groups.filter((g) => ownGroups.has(g));
	if (
		!sameSet(
			managedGroups,
			desired.groups.map((g) => groupIds[g]),
		)
	)
		changes.push("ετικέτες");
	if (existing.managedKey !== desired.key) changes.push("σύνδεση με το Μαθητολόγιο");
	return changes;
}

/**
 * The steps from `existing` to `desired`.
 *
 * For each register number: the managed contact with that key, else the earlier import of it (a contact
 * whose every number belongs to this register entry) is taken over; further such copies are duplicates.
 * A contact holding numbers that are not this entry's is someone else's card and stays untouched.
 */
export function planContacts(desired: DesiredResult, existing: ExistingContact[], groupIds: Record<GroupKey, string>): ContactsPlan {
	const byPhone = new Map<string, ExistingContact[]>();
	for (const contact of existing) for (const phone of contact.phones) byPhone.set(phone.key, [...(byPhone.get(phone.key) ?? []), contact]);
	const managedGroupId = groupIds.managed;
	const isManaged = (c: ExistingContact) => c.managedKey !== null || c.groups.includes(managedGroupId);

	const claimed = new Set<string>();
	const plan: ContactsPlan = {
		create: [],
		update: [],
		unchanged: 0,
		remove: [],
		duplicates: [],
		excluded: desired.excluded,
		noPhone: desired.noPhone,
		untouchedShared: [],
	};
	const untouched = new Map<string, ContactRemoval>();

	for (const want of desired.contacts) {
		const ownNumbers = new Set(want.phones.map((p) => p.key));
		const candidates = [...new Map((byPhone.get(want.key) ?? []).map((c) => [c.resourceName, c])).values()].filter((c) => !claimed.has(c.resourceName));
		// Ours to take over: managed for this key, or an import holding only this entry's numbers, or one named
		// after a pupil on this number (an old import that kept a number the register has since changed).
		const named = (c: ExistingContact) => [displayOf(c), `${c.givenName} ${c.familyName}`].some((n) => want.nameKeys.includes(nameKey(n)));
		const fits = (c: ExistingContact) => (c.unparsedPhones === 0 && c.phones.every((p) => ownNumbers.has(p.key))) || named(c);
		const managed = candidates.filter((c) => c.managedKey === want.key).sort((a, b) => a.resourceName.localeCompare(b.resourceName));
		const adoptable = candidates.filter((c) => c.managedKey !== want.key && fits(c)).sort((a, b) => a.resourceName.localeCompare(b.resourceName));
		for (const c of candidates) if (!managed.includes(c) && !adoptable.includes(c) && !isManaged(c)) untouched.set(c.resourceName, removalOf(c));

		const primary = managed[0] ?? adoptable[0];
		if (!primary) {
			plan.create.push(want);
			continue;
		}
		claimed.add(primary.resourceName);
		const changes = contactChanges(primary, want, groupIds);
		if (changes.length === 0) plan.unchanged++;
		else
			plan.update.push({
				resourceName: primary.resourceName,
				etag: primary.etag,
				from: displayOf(primary),
				adopted: primary.managedKey === null,
				desired: want,
				changes,
			});
		for (const extra of [...managed, ...adoptable]) {
			if (extra === primary) continue;
			claimed.add(extra.resourceName);
			plan.duplicates.push(removalOf(extra));
		}
	}

	for (const contact of existing) {
		if (claimed.has(contact.resourceName) || !isManaged(contact)) continue;
		claimed.add(contact.resourceName);
		plan.remove.push(removalOf(contact));
	}
	plan.untouchedShared = [...untouched.values()].filter((c) => !claimed.has(c.resourceName));
	return plan;
}

/** The plan's counts, for the page and the stored summary. */
export function planCounts(plan: ContactsPlan) {
	return {
		create: plan.create.length,
		update: plan.update.length,
		adopted: plan.update.filter((u) => u.adopted).length,
		unchanged: plan.unchanged,
		remove: plan.remove.length,
		duplicates: plan.duplicates.length,
		excluded: plan.excluded.length,
		noPhone: plan.noPhone.length,
		untouchedShared: plan.untouchedShared.length,
	};
}
export type PlanCounts = ReturnType<typeof planCounts>;

import { describe, expect, test } from "bun:test";
import {
	CLIENT_DATA_KEY,
	GROUP_KEYS,
	buildDesiredContacts,
	contactName,
	phoneKey,
	phoneKeys,
	planContacts,
	splitFullname,
	teacherTitle,
	type ExistingContact,
	type GroupKey,
	type RegisterPupil,
	type RegisterTeacher,
} from "@lib/contacts/plan";
import { openToken, sealToken } from "@lib/contacts/link.server";
import { toExisting } from "@lib/contacts/people.server";

const pupil = (over: Partial<RegisterPupil> & { id: number }): RegisterPupil => ({
	am: String(over.id),
	first_name: "Γιώργος",
	last_name: "Παπαδόπουλος",
	cellphone: "",
	telephone: "-",
	email: "",
	classes: [0],
	last_year: "2026-2027",
	current: true,
	...over,
});

const groupIds = Object.fromEntries(GROUP_KEYS.map((g) => [g, `contactGroups/${g}`])) as Record<GroupKey, string>;

const existing = (over: Partial<ExistingContact> & { resourceName: string }): ExistingContact => ({
	etag: "e1",
	displayName: "",
	givenName: "",
	familyName: "",
	phones: [],
	unparsedPhones: 0,
	emails: [],
	note: "",
	groups: ["contactGroups/myContacts"],
	managedKey: null,
	...over,
});

describe("phoneKey", () => {
	test("Greek numbers in any written form", () => {
		for (const raw of ["6912345678", "691 234 5678", "+30 691 234 5678", "0030 6912345678", "306912345678", "+306912345678"]) {
			expect(phoneKey(raw)).toBe("+306912345678");
		}
		expect(phoneKey("2101234567")).toBe("+302101234567");
	});
	test("foreign numbers need a + or 00", () => {
		expect(phoneKey("+44 7911 123456")).toBe("+447911123456");
		expect(phoneKey("0049 1512 3456789")).toBe("+4915123456789");
		expect(phoneKey("12345")).toBe("");
		expect(phoneKey("-")).toBe("");
		expect(phoneKey("691234567")).toBe("");
	});
	test("two numbers in one field", () => {
		expect(phoneKeys("6912345678 / 6987654321")).toEqual(["+306912345678", "+306987654321"]);
		expect(phoneKeys("6912345678 6987654321")).toEqual(["+306912345678", "+306987654321"]);
		expect(phoneKeys("69123456786987654321")).toEqual(["+306912345678", "+306987654321"]);
		expect(phoneKeys("-")).toEqual([]);
	});
});

describe("contactName", () => {
	test("one pupil", () => {
		expect(contactName([{ first_name: " Μαρία ", last_name: "Ιωάννου" }])).toEqual({ givenName: "Μαρία", familyName: "Ιωάννου" });
	});
	test("siblings share the surname (accents and case ignored)", () => {
		expect(
			contactName([
				{ first_name: "Γιώργος", last_name: "Παπαδόπουλος" },
				{ first_name: "Μαρία", last_name: "ΠΑΠΑΔΟΠΟΥΛΟΣ" },
			]),
		).toEqual({ givenName: "Γιώργος, Μαρία", familyName: "Παπαδόπουλος" });
	});
	test("different surnames", () => {
		expect(
			contactName([
				{ first_name: "Γιώργος", last_name: "Παπαδόπουλος" },
				{ first_name: "Μαρία", last_name: "Ιωάννου" },
			]),
		).toEqual({ givenName: "Γιώργος Παπαδόπουλος & Μαρία Ιωάννου", familyName: "" });
	});
});

describe("buildDesiredContacts", () => {
	test("one contact per number, siblings merged, labels and landlines", () => {
		const { contacts, excluded, noPhone } = buildDesiredContacts([
			pupil({ id: 1, first_name: "Μαρία", cellphone: "6912345678", telephone: "2101234567", classes: [1], current: false, last_year: "2024-2025" }),
			pupil({ id: 2, first_name: "Γιώργος", cellphone: "+30 691 234 5678", classes: [0, 0], email: "Parent@Example.com " }),
			pupil({ id: 3, first_name: "Νίκος", last_name: "Ιωάννου", cellphone: "", telephone: "2107654321", classes: [2] }),
			pupil({ id: 4, cellphone: "-", telephone: "-" }),
		]);
		expect(noPhone).toEqual(["Παπαδόπουλος Γιώργος (ΑΜ 4)"]);
		expect(excluded).toEqual([]);
		expect(contacts).toHaveLength(2);
		const family = contacts.find((c) => c.key === "+306912345678")!;
		expect(family.givenName).toBe("Γιώργος, Μαρία");
		expect(family.phones).toEqual([
			{ key: "+306912345678", type: "mobile" },
			{ key: "+302101234567", type: "home" },
		]);
		expect(family.emails).toEqual(["parent@example.com"]);
		expect(family.groups).toEqual(["managed", "byz", "par", "current"]);
		expect(family.note).toContain("Παπαδόπουλος Μαρία, ΑΜ 1, Παραδοσιακή, τελευταία εγγραφή 2024-2025");
		const landlineOnly = contacts.find((c) => c.key === "+302107654321")!;
		expect(landlineOnly.groups).toEqual(["managed", "eur", "current"]);
	});
	test("a number on too many pupils is left out", () => {
		const register = [1, 2, 3, 4].map((id) => pupil({ id, first_name: `Π${id}`, last_name: `Ε${id}`, cellphone: "6900000000" }));
		const { contacts, excluded } = buildDesiredContacts(register);
		expect(contacts).toEqual([]);
		expect(excluded).toHaveLength(1);
		expect(excluded[0].key).toBe("+306900000000");
		expect(excluded[0].pupils).toHaveLength(4);
	});
});

const teacher = (over: Partial<RegisterTeacher> & { id: number }): RegisterTeacher => ({
	fullname: "Ιωάννης Χρυσάφης",
	telephone: "",
	email: "",
	title: 0,
	gender: "M",
	classes: [0],
	...over,
});

describe("teachers", () => {
	test("names and titles", () => {
		expect(splitFullname(" Μαρία  Αννα Κωνσταντίνου ")).toEqual({ first: "Μαρία Αννα", last: "Κωνσταντίνου" });
		expect(teacherTitle({ title: 0, gender: "F" })).toBe("Καθηγήτρια");
		expect(teacherTitle({ title: 1, gender: "M" })).toBe("Δάσκαλος");
	});

	test("a teacher's number is their contact; pupils on it go in the note, never excluded", () => {
		const register = [1, 2, 3, 4, 5].map((id) => pupil({ id, first_name: `Π${id}`, last_name: `Ε${id}`, cellphone: "6900000000", classes: [1] }));
		register.push(pupil({ id: 9, first_name: "Ιωάννης", last_name: "Χρυσάφης", cellphone: "6911111111", classes: [0] }));
		const { contacts, excluded, noPhone } = buildDesiredContacts(register, [
			teacher({ id: 1, telephone: "6911111111", email: "T@school.gr" }),
			teacher({ id: 2, fullname: "Ελένη Παππά", gender: "F", telephone: "6900000000", classes: [1] }),
			teacher({ id: 3, fullname: "Χωρίς Τηλέφωνο" }),
		]);
		expect(excluded).toEqual([]);
		expect(noPhone).toEqual(["Καθηγητής: Χωρίς Τηλέφωνο"]);
		const own = contacts.find((c) => c.key === "+306911111111")!;
		expect([own.givenName, own.familyName]).toEqual(["Ιωάννης", "Χρυσάφης"]);
		expect(own.groups).toEqual(["managed", "byz", "current", "teachers"]);
		expect(own.emails).toEqual(["t@school.gr"]);
		expect(own.note).toContain("• Καθηγητής: Ιωάννης Χρυσάφης, Βυζαντινή");
		expect(own.note).toContain("Μαθητές:\n• Χρυσάφης Ιωάννης, ΑΜ 9");
		expect(own.people).toEqual(["Καθηγητής: Ιωάννης Χρυσάφης", "Χρυσάφης Ιωάννης (ΑΜ 9)"]);
		const shared = contacts.find((c) => c.key === "+306900000000")!;
		expect([shared.givenName, shared.familyName]).toEqual(["Ελένη", "Παππά"]);
		expect(shared.people).toHaveLength(6);
	});

	test("an old card named after the teacher is adopted", () => {
		const desired = buildDesiredContacts([], [teacher({ id: 1, telephone: "6911111111" })]);
		const plan = planContacts(
			desired,
			[
				existing({
					resourceName: "people/t",
					displayName: "Χρυσάφης Ιωάννης",
					phones: [
						{ key: "+306911111111", type: "mobile" },
						{ key: "+302100000000", type: "home" },
					],
				}),
			],
			groupIds,
		);
		expect(plan.update.map((u) => [u.resourceName, u.adopted])).toEqual([["people/t", true]]);
	});
});

describe("planContacts", () => {
	const desired = buildDesiredContacts([
		pupil({ id: 1, cellphone: "6912345678" }),
		pupil({ id: 2, first_name: "Ελένη", last_name: "Νίκου", cellphone: "6987654321" }),
	]);
	const wantA = desired.contacts.find((c) => c.key === "+306912345678")!;

	test("empty account: everything is created", () => {
		const plan = planContacts(desired, [], groupIds);
		expect(plan.create.map((c) => c.key).sort()).toEqual(["+306912345678", "+306987654321"]);
		expect(plan.update).toEqual([]);
	});

	test("old vcf imports: one adopted, the copies are duplicates, other people's cards untouched", () => {
		const plan = planContacts(
			desired,
			[
				existing({ resourceName: "people/c1", displayName: "Γιώργος Παπαδόπουλος", phones: [{ key: "+306912345678", type: "mobile" }] }),
				existing({ resourceName: "people/c2", displayName: "Γιώργος Παπαδόπουλος", phones: [{ key: "+306912345678", type: "mobile" }] }),
				// A teacher's card that also lists this number: holds another number, so it is not ours.
				existing({
					resourceName: "people/c3",
					displayName: "Κ. Δάσκαλος",
					phones: [
						{ key: "+306912345678", type: "mobile" },
						{ key: "+306900000001", type: "mobile" },
					],
				}),
			],
			groupIds,
		);
		expect(plan.update).toHaveLength(1);
		expect(plan.update[0]).toMatchObject({ resourceName: "people/c1", adopted: true });
		expect(plan.duplicates.map((d) => d.resourceName)).toEqual(["people/c2"]);
		expect(plan.untouchedShared.map((d) => d.resourceName)).toEqual(["people/c3"]);
		expect(plan.create.map((c) => c.key)).toEqual(["+306987654321"]);
		expect(plan.remove).toEqual([]);
	});

	test("a managed contact already in shape is unchanged; one that left the register is removed", () => {
		const inShape = existing({
			resourceName: "people/m1",
			givenName: wantA.givenName,
			familyName: wantA.familyName,
			phones: wantA.phones,
			emails: wantA.emails,
			note: wantA.note,
			groups: ["contactGroups/myContacts", "contactGroups/starred", ...wantA.groups.map((g) => groupIds[g])],
			managedKey: wantA.key,
		});
		const gone = existing({ resourceName: "people/m2", phones: [{ key: "+306911111111", type: "mobile" }], managedKey: "+306911111111" });
		const unmanaged = existing({ resourceName: "people/x", displayName: "Φίλος", phones: [{ key: "+306922222222", type: "mobile" }] });
		const plan = planContacts(desired, [inShape, gone, unmanaged], groupIds);
		expect(plan.unchanged).toBe(1);
		expect(plan.update).toEqual([]);
		expect(plan.remove.map((r) => r.resourceName)).toEqual(["people/m2"]);
		expect(plan.duplicates).toEqual([]);
		expect(plan.untouchedShared).toEqual([]);
	});

	test("changes are detected field by field", () => {
		const stale = existing({
			resourceName: "people/m1",
			givenName: "Γιώργος",
			familyName: "Παπαδόπουλος",
			phones: wantA.phones,
			emails: [],
			note: "παλιά",
			groups: ["contactGroups/myContacts", groupIds.managed],
			managedKey: wantA.key,
		});
		const plan = planContacts(desired, [stale], groupIds);
		expect(plan.update[0].changes).toEqual(["σημείωση", "ετικέτες"]);
		expect(plan.update[0].adopted).toBe(false);
	});

	test("an old import named after the pupil is adopted even with an outdated extra number", () => {
		const plan = planContacts(
			desired,
			[
				existing({
					resourceName: "people/old",
					displayName: "ΠΑΠΑΔΟΠΟΥΛΟΣ Γιωργος",
					phones: [
						{ key: "+306912345678", type: "mobile" },
						{ key: "+302109999999", type: "home" },
					],
				}),
			],
			groupIds,
		);
		expect(plan.update.map((u) => [u.resourceName, u.adopted])).toEqual([["people/old", true]]);
		expect(plan.update[0].changes).toContain("τηλέφωνα");
		expect(plan.untouchedShared).toEqual([]);
	});

	test("a contact with an unreadable extra number is never adopted", () => {
		const plan = planContacts(
			desired,
			[existing({ resourceName: "people/c1", phones: [{ key: "+306912345678", type: "mobile" }], unparsedPhones: 1 })],
			groupIds,
		);
		expect(plan.update).toEqual([]);
		expect(plan.untouchedShared.map((c) => c.resourceName)).toEqual(["people/c1"]);
		expect(plan.create.map((c) => c.key)).toContain("+306912345678");
	});
});

describe("toExisting", () => {
	test("reads the People API person", () => {
		const contact = toExisting({
			resourceName: "people/c9",
			etag: "abc",
			names: [{ givenName: "Γιώργος", familyName: "Π.", displayName: "Γιώργος Π.", metadata: { primary: true } }],
			phoneNumbers: [{ value: "691 234 5678", canonicalForm: "+306912345678", type: "mobile" }, { value: "δεν ξέρω" }],
			emailAddresses: [{ value: " A@B.gr" }],
			memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } }],
			clientData: [{ key: CLIENT_DATA_KEY, value: "+306912345678" }],
		});
		expect(contact).toMatchObject({
			resourceName: "people/c9",
			givenName: "Γιώργος",
			phones: [{ key: "+306912345678", type: "mobile" }],
			unparsedPhones: 1,
			emails: ["a@b.gr"],
			managedKey: "+306912345678",
		});
	});
});

describe("refresh token sealing", () => {
	test("round trip, and another SECRET cannot open it", async () => {
		const sealed = await sealToken("1//refresh-token", "secret-a");
		expect(sealed.startsWith("v1.")).toBe(true);
		expect(sealed).not.toContain("refresh-token");
		expect(await openToken(sealed, "secret-a")).toBe("1//refresh-token");
		expect(await openToken(sealed, "secret-b")).toBeNull();
		expect(await openToken("garbage", "secret-a")).toBeNull();
	});
});

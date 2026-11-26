import { CLIENT_DATA_KEY, phoneKey, type DesiredContact, type ExistingContact, type GroupKey } from "./plan";

/**
 * Google People API (contacts of the connected school account) — server-only, plain `fetch` with the access
 * token from lib/contacts/link.server.ts. Only what the sync needs: list contacts and labels, create labels,
 * and batch create / update / delete contacts (Google's batch limits: 200, 200 and 500 per call).
 *
 * Google asks for writes of one account to be sent one after the other; the sync does that. 429/503 answers
 * are retried with a short backoff.
 */

const API = "https://people.googleapis.com/v1";
const PERSON_FIELDS = "names,phoneNumbers,emailAddresses,biographies,memberships,clientData,metadata";
const UPDATE_FIELDS = "names,phoneNumbers,emailAddresses,biographies,memberships,clientData";
export const MY_CONTACTS = "contactGroups/myContacts";

export class PeopleAPIError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "PeopleAPIError";
	}
}

type Person = {
	resourceName?: string;
	etag?: string;
	names?: { givenName?: string; familyName?: string; displayName?: string; metadata?: { primary?: boolean } }[];
	phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[];
	emailAddresses?: { value?: string }[];
	biographies?: { value?: string; contentType?: string }[];
	memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
	clientData?: { key?: string; value?: string }[];
};

export type ContactGroup = { resourceName: string; name: string; groupType?: string; memberCount?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${API}${path}`, {
			...init,
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
		});
		if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
		if ((res.status === 429 || res.status === 503) && attempt < 3) {
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
		throw new PeopleAPIError(res.status, body?.error?.message ?? `People API ${res.status}`);
	}
}

/** Every contact of the account, as the raw API objects (also what the backup stores). */
export async function listPeople(token: string): Promise<Person[]> {
	const people: Person[] = [];
	let pageToken = "";
	do {
		const query = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: "1000", sortOrder: "FIRST_NAME_ASCENDING" });
		if (pageToken) query.set("pageToken", pageToken);
		const page = await call<{ connections?: Person[]; nextPageToken?: string }>(token, `/people/me/connections?${query}`);
		people.push(...(page.connections ?? []));
		pageToken = page.nextPageToken ?? "";
	} while (pageToken);
	return people;
}

/** A raw contact, reduced for `planContacts`. */
export function toExisting(person: Person): ExistingContact {
	const name = person.names?.find((n) => n.metadata?.primary) ?? person.names?.[0];
	let unparsedPhones = 0;
	const phones = new Map<string, "mobile" | "home">();
	for (const phone of person.phoneNumbers ?? []) {
		const key = phoneKey(phone.canonicalForm || phone.value);
		if (!key) unparsedPhones++;
		else if (!phones.has(key)) phones.set(key, phone.type === "home" ? "home" : "mobile");
	}
	const note = person.biographies?.[0]?.value ?? "";
	return {
		resourceName: person.resourceName ?? "",
		etag: person.etag ?? "",
		displayName: name?.displayName ?? "",
		givenName: name?.givenName ?? "",
		familyName: name?.familyName ?? "",
		phones: [...phones].map(([key, type]) => ({ key, type })),
		unparsedPhones,
		emails: [...new Set((person.emailAddresses ?? []).map((e) => (e.value ?? "").trim().toLowerCase()).filter(Boolean))],
		note: note.replace(/\r\n/g, "\n"),
		groups: (person.memberships ?? []).map((m) => m.contactGroupMembership?.contactGroupResourceName ?? "").filter(Boolean),
		managedKey: person.clientData?.find((d) => d.key === CLIENT_DATA_KEY)?.value ?? null,
	};
}

export async function listGroups(token: string): Promise<ContactGroup[]> {
	const page = await call<{ contactGroups?: ContactGroup[] }>(token, `/contactGroups?pageSize=1000&groupFields=name,groupType,memberCount`);
	return page.contactGroups ?? [];
}

export async function createGroup(token: string, name: string): Promise<ContactGroup> {
	return call<ContactGroup>(token, `/contactGroups`, { method: "POST", body: JSON.stringify({ contactGroup: { name } }) });
}

/** The People API body of a desired contact. `keepGroups`: memberships to keep (labels the school added, starred…). */
function personBody(desired: DesiredContact, groupIds: Record<GroupKey, string>, keepGroups: string[] = []): Person {
	const groups = new Set([MY_CONTACTS, ...keepGroups, ...desired.groups.map((g) => groupIds[g])]);
	return {
		names: [{ givenName: desired.givenName, familyName: desired.familyName }],
		phoneNumbers: desired.phones.map((p) => ({ value: p.key, type: p.type })),
		emailAddresses: desired.emails.map((value) => ({ value })),
		biographies: [{ value: desired.note, contentType: "TEXT_PLAIN" }],
		memberships: [...groups].map((contactGroupResourceName) => ({ contactGroupMembership: { contactGroupResourceName } })),
		clientData: [{ key: CLIENT_DATA_KEY, value: desired.key }],
	};
}

const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export async function batchCreate(token: string, contacts: DesiredContact[], groupIds: Record<GroupKey, string>) {
	let done = 0;
	for (const batch of chunks(contacts, 200)) {
		await call(token, `/people:batchCreateContacts`, {
			method: "POST",
			body: JSON.stringify({ contacts: batch.map((c) => ({ contactPerson: personBody(c, groupIds) })), readMask: "names" }),
		});
		done += batch.length;
	}
	return done;
}

export type UpdateItem = { resourceName: string; etag: string; desired: DesiredContact; keepGroups: string[] };

export async function batchUpdate(token: string, items: UpdateItem[], groupIds: Record<GroupKey, string>) {
	let done = 0;
	for (const batch of chunks(items, 200)) {
		const contacts = Object.fromEntries(
			batch.map((item) => [item.resourceName, { ...personBody(item.desired, groupIds, item.keepGroups), etag: item.etag }]),
		);
		await call(token, `/people:batchUpdateContacts`, {
			method: "POST",
			body: JSON.stringify({ contacts, updateMask: UPDATE_FIELDS, readMask: "names" }),
		});
		done += batch.length;
	}
	return done;
}

export async function batchDelete(token: string, resourceNames: string[]) {
	let done = 0;
	for (const batch of chunks(resourceNames, 500)) {
		await call(token, `/people:batchDeleteContacts`, { method: "POST", body: JSON.stringify({ resourceNames: batch }) });
		done += batch.length;
	}
	return done;
}

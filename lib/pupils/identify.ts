/**
 * How the public registration form identifies a returning pupil (`Pupils.identify`).
 *
 * The family types ONE proof next to the ΑΜ (or next to the name, when they don't remember the ΑΜ): their ΑΜΚΑ or
 * their phone number. The rule is the same on both paths:
 *  - a pupil with an ΑΜΚΑ on file must give that ΑΜΚΑ;
 *  - a pupil without one (registered before ΑΜΚΑ was required; placeholders such as 00000000000 count as none) may
 *    give a phone number on file instead — landline or mobile, compared digits-only without the country code.
 *
 * Pure module (no DB, no env): shared by the route and its unit test.
 */
import { isPlaceholderAmka, normalizeDigits, normalizeKey, normalizePhone } from "./normalize";

export type Proof = { kind: "amka"; amka: string } | { kind: "phone"; phone: string } | { kind: "invalid" };

/**
 * Exactly 11 digits read as an ΑΜΚΑ (a Greek phone number has 10, or 12+ with the country code); anything else with at
 * least 8 digits as a phone number.
 */
export function classifyProof(value: string): Proof {
	const digits = normalizeDigits(value);
	if (digits.length === 11) return { kind: "amka", amka: digits };
	const phone = normalizePhone(value);
	return phone ? { kind: "phone", phone } : { kind: "invalid" };
}

type ProofFields = { amka: string | null; telephone: string | null; cellphone: string | null };

/** Whether the pupil has a real ΑΜΚΑ on file (not empty, not a placeholder like 00000000000). */
export const hasRealAmka = (pupil: Pick<ProofFields, "amka">) => !!pupil.amka && !isPlaceholderAmka(pupil.amka);

export type ProofResult = "match" | "mismatch" | "amka_required";

/** Checks the proof against the pupil (see the rule above). `amka_required`: a phone was given for a pupil who has an ΑΜΚΑ. */
export function checkProof(pupil: ProofFields, proof: Proof): ProofResult {
	if (proof.kind === "invalid") return "mismatch";
	if (hasRealAmka(pupil)) {
		if (proof.kind === "phone") return "amka_required";
		return pupil.amka === proof.amka ? "match" : "mismatch";
	}
	if (proof.kind === "amka") return "mismatch";
	const phones = [pupil.telephone, pupil.cellphone].map(normalizePhone).filter(Boolean);
	return phones.includes(proof.phone) ? "match" : "mismatch";
}

/** The words of a name, accent-, case- and punctuation-insensitive: «Γεωργίου-Ελένη» → ["γεωργιου", "ελενη"]. */
const nameWords = (value: string | null | undefined) =>
	normalizeKey(value)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/**
 * Whether the typed first name + surname are the pupil's: the same words in any order and split any way between the
 * two fields («Μαρία Ελένη» / «Παπαδοπούλου» = «Παπαδοπούλου Μαρία-Ελένη»). Never a prefix match: the name is half of
 * the identification.
 */
export function sameName(pupil: { first_name: string; last_name: string }, firstName: string, lastName: string): boolean {
	const typed = [...nameWords(firstName), ...nameWords(lastName)].sort();
	const stored = [...nameWords(pupil.first_name), ...nameWords(pupil.last_name)].sort();
	return typed.length > 0 && typed.length === stored.length && typed.every((word, i) => word === stored[i]);
}

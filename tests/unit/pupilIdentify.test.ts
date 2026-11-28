import { describe, expect, test } from "bun:test";
import { checkProof, classifyProof, hasRealAmka, sameName } from "@lib/pupils/identify";
import { openPupilIdentity, sealPupilIdentity, IDENTITY_TTL_MS } from "@lib/pupils/identityToken.server";

const withAmka = { amka: "01019012345", telephone: "2102811111", cellphone: "6971234567" };
const withoutAmka = { amka: "", telephone: "210 281 1111", cellphone: "+30 697 123 4567" };
const placeholderAmka = { ...withoutAmka, amka: "00000000000" };

describe("proof classification", () => {
	test("11 digits are an ΑΜΚΑ, including a birth day of 30", () => {
		expect(classifyProof("01019012345")).toEqual({ kind: "amka", amka: "01019012345" });
		expect(classifyProof("30019012345")).toEqual({ kind: "amka", amka: "30019012345" });
	});
	test("phone numbers, with spaces or the country code", () => {
		expect(classifyProof("697 123 4567")).toEqual({ kind: "phone", phone: "6971234567" });
		expect(classifyProof("+30 6971234567")).toEqual({ kind: "phone", phone: "6971234567" });
		expect(classifyProof("0030 210 2811111")).toEqual({ kind: "phone", phone: "2102811111" });
	});
	test("too short is invalid", () => {
		expect(classifyProof("12345")).toEqual({ kind: "invalid" });
		expect(classifyProof("-")).toEqual({ kind: "invalid" });
	});
});

describe("proof check", () => {
	test("a pupil with an ΑΜΚΑ must give it; a phone is refused with amka_required", () => {
		expect(checkProof(withAmka, classifyProof("01019012345"))).toBe("match");
		expect(checkProof(withAmka, classifyProof("01019012346"))).toBe("mismatch");
		expect(checkProof(withAmka, classifyProof("6971234567"))).toBe("amka_required");
	});
	test("a pupil without an ΑΜΚΑ is matched on either phone on file", () => {
		expect(checkProof(withoutAmka, classifyProof("6971234567"))).toBe("match");
		expect(checkProof(withoutAmka, classifyProof("2102811111"))).toBe("match");
		expect(checkProof(withoutAmka, classifyProof("6970000000"))).toBe("mismatch");
		expect(checkProof(withoutAmka, classifyProof("01019012345"))).toBe("mismatch");
	});
	test("a placeholder ΑΜΚΑ counts as none", () => {
		expect(hasRealAmka(placeholderAmka)).toBe(false);
		expect(checkProof(placeholderAmka, classifyProof("6971234567"))).toBe("match");
		expect(checkProof(placeholderAmka, classifyProof("00000000000"))).toBe("mismatch");
	});
	test("no phone on file never matches", () => {
		expect(checkProof({ amka: "", telephone: "-", cellphone: "" }, classifyProof("6971234567"))).toBe("mismatch");
	});
});

describe("name match", () => {
	const pupil = { first_name: "Μαρία-Ελένη", last_name: "ΠΑΠΑΔΟΠΟΥΛΟΥ" };
	test("accents, case, order and the split between the fields do not matter", () => {
		expect(sameName(pupil, "Μαρία Ελένη", "Παπαδοπούλου")).toBe(true);
		expect(sameName(pupil, "ελενη", "παπαδοπουλου μαρια")).toBe(true);
	});
	test("a prefix or a missing word is not a match", () => {
		expect(sameName(pupil, "Μαρία", "Παπαδοπούλου")).toBe(false);
		expect(sameName(pupil, "Μαρ Ελένη", "Παπαδοπούλου")).toBe(false);
		expect(sameName(pupil, "", "")).toBe(false);
	});
});

describe("identity token", () => {
	const SECRET = "test-secret";
	test("round trip", async () => {
		const token = await sealPupilIdentity(42, SECRET);
		expect(await openPupilIdentity(token, SECRET)).toBe(42);
	});
	test("expired, tampered or signed with another secret", async () => {
		const now = Date.now();
		const token = await sealPupilIdentity(42, SECRET, now);
		expect(await openPupilIdentity(token, SECRET, now + IDENTITY_TTL_MS + 1)).toBeNull();
		expect(await openPupilIdentity(token, "other", now)).toBeNull();
		const [, signature] = token.split(".");
		const forged = btoa(JSON.stringify({ p: 7, e: now + IDENTITY_TTL_MS })).replace(/=+$/, "") + "." + signature;
		expect(await openPupilIdentity(forged, SECRET, now)).toBeNull();
		expect(await openPupilIdentity("garbage", SECRET, now)).toBeNull();
	});
});

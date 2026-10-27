import { canonicalLinkHeader, cvCanonicalPath } from "@lib/bucket/cvCanonical";
import { expect, test } from "bun:test";

const teachers = [
	{ id: 1, fullname: "Σωκράτης Χάρης", cv: "Σωκράτης Χάρης-abc.pdf" },
	{ id: 2, fullname: "Σωκράτης Χάρης", cv: "Σωκράτης Χάρης-def.pdf" },
	{ id: 3, fullname: "Ιωάννης Τούσιας", cv: null },
];

test("a CV file maps to the page of the teacher it belongs to", () => {
	expect(cvCanonicalPath("kathigites/cv/Σωκράτης Χάρης-abc.pdf", teachers)).toBe("/kathigites/sokratis-charis/");
});

test("a duplicate name gets the same -<id> suffix as the page", () => {
	expect(cvCanonicalPath("kathigites/cv/Σωκράτης Χάρης-def.pdf", teachers)).toBe("/kathigites/sokratis-charis-2/");
});

test("a decomposed (NFD) file name still matches", () => {
	expect(cvCanonicalPath("kathigites/cv/Σωκράτης Χάρης-abc.pdf".normalize("NFD"), teachers)).toBe("/kathigites/sokratis-charis/");
});

test("unknown files, other folders and teachers without a CV give null", () => {
	expect(cvCanonicalPath("kathigites/cv/nobody.pdf", teachers)).toBeNull();
	expect(cvCanonicalPath("kathigites/picture/Σωκράτης Χάρης-abc.pdf", teachers)).toBeNull();
	expect(cvCanonicalPath("kathigites/cv/", teachers)).toBeNull();
	expect(cvCanonicalPath("kathigites/cv/x.pdf", [])).toBeNull();
});

test("the Link header is absolute", () => {
	expect(canonicalLinkHeader("/kathigites/sokratis-charis/", "https://musicschool-metamorfosi.gr")).toBe(
		'<https://musicschool-metamorfosi.gr/kathigites/sokratis-charis/>; rel="canonical"',
	);
});

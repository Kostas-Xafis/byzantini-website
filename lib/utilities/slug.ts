// Greek → Latin URL slugs for the public sub-pages (teachers, study centres).
// Deterministic: the same name always gives the same slug, so the URL needs no
// stored column. Simplified ELOT 743 ("Σωκράτης Χάρης" → "sokratis-charis").

const DIGRAPHS: [RegExp, string][] = [
	[/ου/g, "ou"],
	[/αυ/g, "av"],
	[/ευ/g, "ev"],
	[/γγ/g, "ng"],
	[/γκ/g, "gk"],
];

const LETTERS: Record<string, string> = {
	α: "a",
	β: "v",
	γ: "g",
	δ: "d",
	ε: "e",
	ζ: "z",
	η: "i",
	θ: "th",
	ι: "i",
	κ: "k",
	λ: "l",
	μ: "m",
	ν: "n",
	ξ: "x",
	ο: "o",
	π: "p",
	ρ: "r",
	σ: "s",
	ς: "s",
	τ: "t",
	υ: "y",
	φ: "f",
	χ: "ch",
	ψ: "ps",
	ω: "o",
};

export function slugify(text: string): string {
	let s = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
	for (const [re, latin] of DIGRAPHS) s = s.replace(re, latin);
	s = [...s].map((ch) => LETTERS[ch] ?? ch).join("");
	return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// id → slug for a whole list; a name that repeats gets `-<id>` on every copy
// after the first (ordered by id, so the suffix never moves to another row).
export function uniqueSlugs<T extends { id: number }>(rows: T[], name: (row: T) => string): Map<number, string> {
	const out = new Map<number, string>();
	const seen = new Set<string>();
	for (const row of [...rows].sort((a, b) => a.id - b.id)) {
		const base = slugify(name(row));
		const slug = seen.has(base) ? `${base}-${row.id}` : base;
		seen.add(base);
		out.set(row.id, slug);
	}
	return out;
}

export const teacherSlugs = <T extends { id: number; fullname: string }>(teachers: T[]) => uniqueSlugs(teachers, (t) => t.fullname);
export const locationSlugs = <T extends { id: number; name: string }>(locations: T[]) => uniqueSlugs(locations, (l) => l.name);
export const teacherPath = (slug: string) => `/kathigites/${slug}/`;
export const locationPath = (slug: string) => `/spoudastiria/${slug}/`;

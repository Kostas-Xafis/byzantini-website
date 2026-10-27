// Shapes of the editorial content behind the course pages (/mathimata/…) and
// the guides (/odigoi/…). The copy lives in lib/content/courses.ts and
// lib/content/guides.ts; the pages only render it.
//
// Inline text supports two marks, nothing else: **bold** and [label](/path/).

export type ContentBlock = { type: "p"; text: string } | { type: "list"; items: string[] } | { type: "h3"; text: string };

export interface ContentSection {
	id: string; // anchor, latin kebab-case
	heading: string;
	blocks: ContentBlock[];
}

export interface FAQ {
	q: string;
	a: string;
}

export type CourseSlug = "vyzantini-mousiki" | "paradosiaki-mousiki" | "evropaiki-mousiki";

export interface CoursePage {
	slug: CourseSlug;
	classType: "byz" | "par" | "eur";
	classId: 0 | 1 | 2;
	title: string; // h1, e.g. "Μαθήματα Βυζαντινής Μουσικής"
	seoTitle: string; // <title> without the site suffix, ≤ 60 chars
	description: string; // meta description, 140–160 chars
	lead: string; // intro paragraph under the h1
	facts: { label: string; value: string }[]; // 3–5 "at a glance" items
	sections: ContentSection[];
	instruments?: { name: string; description: string }[]; // par / eur only
	faq: FAQ[];
}

export interface GuidePage {
	slug: string; // latin kebab-case
	title: string; // h1
	seoTitle: string;
	description: string;
	lead: string;
	updated: string; // ISO date of the last content review
	sections: ContentSection[];
	faq?: FAQ[];
	related: CourseSlug[];
}

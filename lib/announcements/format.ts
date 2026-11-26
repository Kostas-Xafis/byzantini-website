/**
 * Announcement text format — client-safe (the public page, the excerpts and the admin editor's preview all
 * use it).
 *
 * `announcements.content` is plain text with a few marks, one block per line (an empty line is only spacing):
 *
 *   ## Επικεφαλίδα            a heading (### a smaller one)
 *   - στοιχείο                a bulleted list (also «*», «•», «·», «–» — consecutive lines make one list)
 *   1. στοιχείο               a numbered list (also «1)»; it starts at the first item's number)
 *   **έντονα**  *πλάγια*      bold, italic (\* is a literal asterisk)
 *   [κείμενο](https://…)      a link; a bare https://… address or an email is linked by itself
 *   any other line            a paragraph
 *
 * Everything is HTML-escaped before the marks are applied and only http(s), mailto: and site-relative links
 * survive, so stored text can never inject markup. Rows saved before this format may still hold the
 * `<a href='…'>…</a>` the old save handler wrapped around URLs; those render as links too.
 */

export type AnnouncementBlock =
	| { kind: "p"; html: string; text: string }
	| { kind: "h2" | "h3"; html: string; text: string }
	| { kind: "ul"; items: { html: string; text: string }[] }
	| { kind: "ol"; start: number; items: { html: string; text: string }[] };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Older dev/replication snapshots store newlines as the two characters "\n" (a no-op on production data).
const normalize = (content: string) => content.replaceAll("\\n", "\n").replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^(?:[-–•·]\s*|\*\s+)(?=\S)/;
const NUMBERED = /^(\d{1,3})[.)]\s+(?=\S)/;

type Line = { kind: "p" | "h2" | "h3" | "ul" | "ol"; text: string; number?: number };

function classify(raw: string): Line | null {
	const line = raw.trim();
	if (!line) return null;
	const heading = HEADING.exec(line);
	if (heading) return { kind: heading[1].length === 3 ? "h3" : "h2", text: heading[2].trim() };
	// "**Έντονο**" at the start of a line is bold, not a bullet.
	if (BULLET.test(line) && !line.startsWith("**")) return { kind: "ul", text: line.replace(BULLET, "") };
	const numbered = NUMBERED.exec(line);
	if (numbered) return { kind: "ol", text: line.slice(numbered[0].length), number: Number(numbered[1]) };
	return { kind: "p", text: line };
}

// ---- inline marks -----------------------------------------------------------------------------------------

const LEGACY_ANCHOR = /<a href='([^']+)'>([^<]*)<\/a>/g;
const MD_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
// A bare address: stops at whitespace, and trailing punctuation belongs to the sentence, not the URL.
const BARE_URL = /\bhttps?:\/\/[^\s<>"'«»]+[^\s<>"'«».,;:!?)\]]/g;
// Italic: single asterisks that hug a word on both sides (not inside a word, so «5*3*2» stays as it is).
const ITALIC = /(?<![\p{L}\p{N}*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\p{L}\p{N}*])/gu;
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi;

const safeHref = (href: string): string | null => {
	if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
	if (/^mailto:[^\s]+$/i.test(href)) return href;
	if (href.startsWith("/") && !href.startsWith("//")) return href;
	return null;
};

const anchor = (href: string, labelHtml: string) => {
	const external = !href.startsWith("/");
	return `<a href="${escapeHtml(href)}"${external && !href.startsWith("mailto:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${labelHtml}</a>`;
};

// Placeholders never typed by hand (private-use characters), swapped back after the marks are applied.
const PH_OPEN = "";
const PH_CLOSE = "";
const STAR = "";

/** One line of text → safe inline HTML (bold, italic, links). */
export function renderInline(text: string): string {
	const tokens: string[] = [];
	const hold = (html: string) => `${PH_OPEN}${tokens.push(html) - 1}${PH_CLOSE}`;

	let s = text.replace(/\\\*/g, STAR);
	// Links first, so a URL's own characters (an underscore, an asterisk) are never read as marks.
	s = s.replace(LEGACY_ANCHOR, (match, href: string, label: string) => {
		const safe = safeHref(href);
		return safe ? hold(anchor(safe, escapeHtml(label))) : match;
	});
	s = s.replace(MD_LINK, (match, label: string, href: string) => {
		const safe = safeHref(href);
		return safe ? hold(anchor(safe, emphasis(escapeHtml(label)))) : match;
	});
	s = s.replace(BARE_URL, (url) => hold(anchor(url, escapeHtml(url))));
	s = s.replace(EMAIL, (email) => hold(anchor(`mailto:${email}`, escapeHtml(email))));

	let html = emphasis(escapeHtml(s));
	html = html.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g"), (_m, i: string) => tokens[Number(i)]);
	return html.replaceAll(STAR, "*");
}

function emphasis(html: string): string {
	return html.replace(BOLD, "<strong>$1</strong>").replace(ITALIC, "<em>$1</em>");
}

/** One line of text without its marks (links keep their label). */
export function plainInline(text: string): string {
	return text.replace(/\\\*/g, STAR).replace(LEGACY_ANCHOR, "$2").replace(MD_LINK, "$1").replace(BOLD, "$1").replace(ITALIC, "$1").replaceAll(STAR, "*");
}

// ---- blocks -----------------------------------------------------------------------------------------------

/** The announcement as blocks, each with its safe HTML and its plain text. */
export function parseAnnouncement(content: string): AnnouncementBlock[] {
	const blocks: AnnouncementBlock[] = [];
	for (const raw of normalize(content).split("\n")) {
		const line = classify(raw);
		if (!line) continue;
		const item = { html: renderInline(line.text), text: plainInline(line.text) };
		const last = blocks.at(-1);
		if (line.kind === "ul") {
			if (last?.kind === "ul") last.items.push(item);
			else blocks.push({ kind: "ul", items: [item] });
		} else if (line.kind === "ol") {
			if (last?.kind === "ol") last.items.push(item);
			else blocks.push({ kind: "ol", start: line.number ?? 1, items: [item] });
		} else {
			blocks.push({ kind: line.kind, ...item });
		}
	}
	return blocks;
}

/** Blocks → HTML (plain tags; the page styles them through a wrapper class, `.announcement-text`). */
export function blocksToHtml(blocks: AnnouncementBlock[]): string {
	return blocks
		.map((block) => {
			switch (block.kind) {
				case "ul":
					return `<ul>${block.items.map((i) => `<li>${i.html}</li>`).join("")}</ul>`;
				case "ol":
					return `<ol${block.start !== 1 ? ` start="${block.start}"` : ""}>${block.items.map((i) => `<li>${i.html}</li>`).join("")}</ol>`;
				default:
					return `<${block.kind}>${block.html}</${block.kind}>`;
			}
		})
		.join("");
}

export const announcementHtml = (content: string) => blocksToHtml(parseAnnouncement(content));

/** The whole text without marks, one space between blocks — for excerpts, meta descriptions and search. */
export function announcementPlainText(content: string): string {
	return parseAnnouncement(content)
		.flatMap((block) => ("items" in block ? block.items.map((i) => i.text) : [block.text]))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

/** A word-boundary excerpt of the plain text. */
export function announcementExcerpt(content: string, max: number): string {
	const clean = announcementPlainText(content);
	if (clean.length <= max) return clean;
	const cut = clean.slice(0, max);
	const lastSpace = cut.lastIndexOf(" ");
	return cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd() + "…";
}

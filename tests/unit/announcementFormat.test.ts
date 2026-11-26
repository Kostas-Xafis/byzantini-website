import { describe, expect, test } from "bun:test";
import { announcementExcerpt, announcementHtml, announcementPlainText, parseAnnouncement, renderInline } from "@lib/announcements/format";
import { insertLink, toggleLines, toggleWrap, type TextEdit } from "@lib/announcements/editing";

describe("announcement inline marks", () => {
	test("bold and italic", () => {
		expect(renderInline("Η **Τρίτη 17** και *ώρα 6 μ.μ.*")).toBe("Η <strong>Τρίτη 17</strong> και <em>ώρα 6 μ.μ.</em>");
		expect(renderInline("**Πρόεδρος:** π. Χρίστος")).toBe("<strong>Πρόεδρος:</strong> π. Χρίστος");
	});

	test("asterisks that are not marks stay as they are", () => {
		expect(renderInline("5*3*2 και * μόνο")).toBe("5*3*2 και * μόνο");
		expect(renderInline("\\*σημείωση\\*")).toBe("*σημείωση*");
	});

	test("everything is escaped", () => {
		expect(renderInline(`<script>alert("x")</script> & 'a'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;a&#39;");
		expect(renderInline("**<b>x</b>**")).toBe("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
	});

	test("links: markdown, bare URLs, emails, legacy anchors", () => {
		expect(renderInline("Δείτε [εδώ](https://example.com/a_b*c*)!")).toBe(
			'Δείτε <a href="https://example.com/a_b*c*" target="_blank" rel="noopener noreferrer">εδώ</a>!',
		);
		expect(renderInline("Στο https://example.com/x.")).toBe(
			'Στο <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>.',
		);
		expect(renderInline("Email: music@example.gr καί")).toBe('Email: <a href="mailto:music@example.gr">music@example.gr</a> καί');
		expect(renderInline("<a href='https://example.com'>https://example.com</a>")).toBe(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
		);
		expect(renderInline("[Μαθήματα](/mathimata/)")).toBe('<a href="/mathimata/">Μαθήματα</a>');
		expect(renderInline("**[Έντονος](/a/)** σύνδεσμος")).toBe('<strong><a href="/a/">Έντονος</a></strong> σύνδεσμος');
	});

	test("unsafe links are not links", () => {
		expect(renderInline("[x](javascript:alert(1))")).not.toContain("<a");
		expect(renderInline("[x](//evil.example)")).not.toContain("<a");
		expect(renderInline(`[x](https://a.example/"onmouseover=")`)).not.toContain('"onmouseover');
	});
});

describe("announcement blocks", () => {
	test("paragraphs, headings and lists", () => {
		const content = ["Πρώτη παράγραφος.", "", "## Επιτροπή", "- Α", "", "- Β", "Μετά.", "3. Τρίτο", "4) Τέταρτο", "### Μικρή"].join("\n");
		expect(parseAnnouncement(content).map((b) => b.kind)).toEqual(["p", "h2", "ul", "p", "ol", "h3"]);
		expect(announcementHtml(content)).toBe(
			'<p>Πρώτη παράγραφος.</p><h2>Επιτροπή</h2><ul><li>Α</li><li>Β</li></ul><p>Μετά.</p><ol start="3"><li>Τρίτο</li><li>Τέταρτο</li></ol><h3>Μικρή</h3>',
		);
	});

	test("the old plain-text lists still render as lists", () => {
		expect(announcementHtml("-Αντιδήμαρχοι\n• Δήμαρχος\n·\tΥπουργός")).toBe("<ul><li>Αντιδήμαρχοι</li><li>Δήμαρχος</li><li>Υπουργός</li></ul>");
	});

	test("a bold line is not a bullet; a year is not a numbered item", () => {
		expect(parseAnnouncement("**Μέλη:**")[0].kind).toBe("p");
		expect(parseAnnouncement("2024. Χρονιά")[0].kind).toBe("p");
		expect(parseAnnouncement("Α. Τμήμα Λαούτου")[0].kind).toBe("p");
	});

	test("escaped newlines from old snapshots", () => {
		expect(parseAnnouncement("α\\nβ").length).toBe(2);
	});

	test("plain text and excerpts drop the marks", () => {
		const content = "## Τίτλος\n**Έντονα** και *πλάγια* με [σύνδεσμο](https://example.com).\n- ένα\n1. δύο";
		expect(announcementPlainText(content)).toBe("Τίτλος Έντονα και πλάγια με σύνδεσμο. ένα δύο");
		expect(announcementExcerpt(content, 20)).toBe("Τίτλος Έντονα και…");
	});
});

describe("announcement editor toolbar", () => {
	const run = (value: string, edit: TextEdit) => value.slice(0, edit.from) + edit.insert + value.slice(edit.to);

	test("bold wraps the selection, keeps edge spaces outside and toggles off", () => {
		const v = "Η Τρίτη 17 Σεπτεμβρίου";
		const e = toggleWrap(v, 2, 11, "**", "x"); // "Τρίτη 17 "
		expect(run(v, e)).toBe("Η **Τρίτη 17** Σεπτεμβρίου");
		const bolded = run(v, e);
		expect(run(bolded, toggleWrap(bolded, e.selStart, e.selEnd, "**", "x"))).toBe(v);
		expect(run(bolded, toggleWrap(bolded, 2, 14, "**", "x"))).toBe(v); // selection includes the marks
	});

	test("italic on an empty selection inserts a placeholder and selects it", () => {
		const e = toggleWrap("α ", 2, 2, "*", "πλάγιο");
		expect(run("α ", e)).toBe("α *πλάγιο*");
		expect(run("α ", e).slice(e.selStart, e.selEnd)).toBe("πλάγιο");
	});

	test("italic does not unwrap bold", () => {
		const v = "**λέξη**";
		expect(run(v, toggleWrap(v, 0, v.length, "*", "x"))).toBe("***λέξη***");
	});

	test("lists number the touched lines and toggle back", () => {
		const v = "Αρχή\nΑ\nΒ\n- Γ\nΤέλος";
		const start = v.indexOf("Α\n");
		const end = v.indexOf("Τέλος") - 1;
		const ol = toggleLines(v, start, end, "ol");
		expect(run(v, ol)).toBe("Αρχή\n1. Α\n2. Β\n3. Γ\nΤέλος");
		const numbered = run(v, ol);
		expect(run(numbered, toggleLines(numbered, ol.selStart, ol.selEnd, "ol"))).toBe("Αρχή\nΑ\nΒ\nΓ\nΤέλος");
		expect(run(v, toggleLines(v, 0, 0, "h2"))).toBe("## Αρχή\nΑ\nΒ\n- Γ\nΤέλος");
	});

	test("link: label from the selection, the address selected", () => {
		const v = "δείτε εδώ";
		const e = insertLink(v, 6, 9, "κείμενο");
		expect(run(v, e)).toBe("δείτε [εδώ](https://)");
		expect(run(v, e).slice(e.selStart, e.selEnd)).toBe("https://");
		const u = "https://example.com";
		expect(run(u, insertLink(u, 0, u.length, "κείμενο"))).toBe("[κείμενο](https://example.com)");
	});
});

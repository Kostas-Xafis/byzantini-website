#!/usr/bin/env bun
/**
 * pupilIssuesReport.ts — the secretary-facing «Μαθητολόγιο — εκκρεμότητες» report.
 *
 * Reads a D1 target (read-only) and writes the two documents the school's
 * secretaries work from:
 *
 *   reports/mathitologio-ektremotites.md/.pdf            — the summary
 *   reports/mathitologio-ektremotites-parartima.md/.pdf  — the detailed lists
 *
 * The PDFs are printed from the same content by headless Chrome
 * (`--print-to-pdf`), which is what produced the earlier revisions of these
 * documents, so the output stays in the same family.
 *
 * ⚠ The output contains personal data (names, ΑΜΚΑ, phone numbers). `reports/`
 * is gitignored on purpose — never commit, paste or send these files anywhere
 * outside the school.
 *
 * Usage:
 *   bun scripts/pupilIssuesReport.ts                     # local dev DB → reports/
 *   bun scripts/pupilIssuesReport.ts --db prod           # read production instead
 *   bun scripts/pupilIssuesReport.ts --date 2026-10-12 --out reports/
 *   bun scripts/pupilIssuesReport.ts --no-pdf            # markdown only
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { personNameKey } from "../lib/pupils/normalize";
import { openTarget, REPO_ROOT, resolveTarget, type D1Client, type TargetName } from "./lib/d1";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

type Args = { db: TargetName; out: string; date: Date; pdf: boolean };

function parseArgs(argv: string[]): Args {
	const args: Args = { db: "local", out: path.join(REPO_ROOT, "reports"), date: new Date(), pdf: true };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		switch (arg) {
			case "--db": {
				const value = argv[++i];
				if (value !== "local" && value !== "preview" && value !== "prod") throw new Error(`--db expects 'local', 'preview' or 'prod', got '${value}'`);
				args.db = value;
				break;
			}
			case "--out": {
				const value = argv[++i];
				if (!value) throw new Error("--out expects a directory");
				args.out = path.resolve(value);
				break;
			}
			case "--date": {
				const value = argv[++i];
				const parsed = value ? new Date(`${value}T12:00:00`) : null;
				if (!parsed || Number.isNaN(parsed.getTime())) throw new Error("--date expects YYYY-MM-DD");
				args.date = parsed;
				break;
			}
			case "--no-pdf":
				args.pdf = false;
				break;
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown argument '${arg}' (try --help)`);
		}
	}
	return args;
}

function printUsage() {
	console.log(`Usage: bun scripts/pupilIssuesReport.ts [options]

  --db local|preview|prod   which database to read (default: local)
  --out <dir>               output directory (default: reports/)
  --date <YYYY-MM-DD>       report date (default: today)
  --no-pdf                  write the Markdown only, skip the Chrome PDF step
  -h, --help                this text

Writes <out>/mathitologio-ektremotites.{md,pdf} and
       <out>/mathitologio-ektremotites-parartima.{md,pdf}.

⚠ The documents contain personal data (names, ΑΜΚΑ, phones); reports/ is
  gitignored. Do not commit or share them.`);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Row = {
	id: number;
	am: number | null;
	orphan_code: string;
	split_from_am: number | null;
	first_name: string;
	last_name: string;
	fathers_name: string;
	amka: string;
	cellphone: string;
	telephone: string;
	review_note: string;
	years: string | null;
};

const SELECT_PUPILS = `SELECT p.id, p.am, p.orphan_code, p.split_from_am, p.first_name, p.last_name, p.fathers_name,
	p.amka, p.cellphone, p.telephone, p.review_note,
	(SELECT GROUP_CONCAT(DISTINCT e.registration_year) FROM pupil_enrollments e WHERE e.pupil_id = p.id) AS years
	FROM pupils p`;

const el = (n: number) => n.toLocaleString("el-GR");
const GREEK_MONTHS = [
	"Ιανουαρίου",
	"Φεβρουαρίου",
	"Μαρτίου",
	"Απριλίου",
	"Μαΐου",
	"Ιουνίου",
	"Ιουλίου",
	"Αυγούστου",
	"Σεπτεμβρίου",
	"Οκτωβρίου",
	"Νοεμβρίου",
	"Δεκεμβρίου",
];
const greekDate = (date: Date) => `${date.getDate()} ${GREEK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
const shortDate = (date: Date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

const nameOf = (row: Row) => `${row.last_name} ${row.first_name}`.trim();
const amkaOf = (row: Row) => row.amka || "—";
const phonesOf = (row: Row) =>
	[row.cellphone, row.telephone]
		.map((p) => String(p ?? "").trim())
		.filter((p) => p && p !== "-")
		.join(" - ") || "—";
const codeOf = (row: Row) => (row.am === null ? row.orphan_code : String(row.am));
const yearsOf = (row: Row) =>
	(row.years ?? "")
		.split(",")
		.map((y) => y.trim())
		.filter(Boolean)
		.sort()
		.join(", ") || "—";
const lastYearOf = (row: Row) =>
	(row.years ?? "")
		.split(",")
		.map((y) => y.trim())
		.filter(Boolean)
		.sort()
		.at(-1) ?? "—";
const digits = (value: string) => String(value ?? "").replace(/\D/g, "");
/** The ΑΜ value a rejected row carried, as the backfill recorded it in the note. */
const rejectedAmOf = (row: Row) => row.review_note.match(/μη έγκυρο ΑΜ '([^']*)'/)?.[1] ?? row.orphan_code.replace(/-Ο\d+$/, "");
const isWaiting = (row: Row) => /Αναμονή/.test(row.review_note);

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Pair<T> = { a: T; b: T };

/** Every pair of rows that share a non-null key. */
function pairsWithin<T>(rows: T[], keyOf: (row: T) => string | null): Pair<T>[] {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = keyOf(row);
		if (!key) continue;
		const bucket = groups.get(key);
		if (bucket) bucket.push(row);
		else groups.set(key, [row]);
	}
	const pairs: Pair<T>[] = [];
	for (const group of groups.values()) {
		for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) pairs.push({ a: group[i]!, b: group[j]! });
	}
	return pairs;
}

type Analysis = ReturnType<typeof classify>;

function classify(rows: Row[]) {
	const withAm = rows.filter((row) => row.am !== null);
	const orphans = rows.filter((row) => row.am === null);
	// The backfill records *why* an ΑΜ was rejected in the pupil's review note:
	// "χωρίς ΑΜ (νέα εγγραφή)" and "εκκρεμής εγγραφή (Αναμονή)" are genuinely
	// missing ΑΜs; "μη έγκυρο ΑΜ '<value>'" means a value was there but unusable.
	const invalidAm = orphans.filter((row) => /μη έγκυρο ΑΜ '/.test(row.review_note));
	const waiting = orphans.filter((row) => !invalidAm.includes(row) && isWaiting(row));
	const missingAm = orphans.filter((row) => !invalidAm.includes(row) && !waiting.includes(row));

	const pairsOf = (key: (row: Row) => string | null) => pairsWithin(withAm, key);
	const keyOfPair = (pair: Pair<Row>) => [pair.a.id, pair.b.id].sort((a, b) => a - b).join("|");

	// Δ1 — same ΑΜΚΑ *and* same name: the same person holding two ΑΜ.
	const sameAmkaName = pairsOf((row) => (row.amka.length === 11 ? `${row.amka}|${personNameKey(row)}` : null));
	const seen = new Set(sameAmkaName.map(keyOfPair));
	// Δ2 — same mobile *and* the same name: almost certainly the same person. A
	// mobile shared by different names is a family/school number, not a duplicate
	// (in this register one such number is on 18 different cards).
	const samePhone = pairsOf((row) => {
		const phone = digits(row.cellphone);
		return phone.length >= 10 ? `${phone}|${personNameKey(row)}` : null;
	}).filter((pair) => !seen.has(keyOfPair(pair)));
	for (const pair of samePhone) seen.add(keyOfPair(pair));
	// Δ3 — same name only: usually homonyms, worth a look only if something else hints.
	const sameNameOnly = pairsOf((row) => personNameKey(row) || null).filter((pair) => !seen.has(keyOfPair(pair)));
	// Ε — one ΑΜΚΑ on different people: at least one of them is wrong. Grouped by
	// ΑΜΚΑ (a single ΑΜΚΑ can sit on three cards, which pair-listing would hide).
	const amkaGroups = new Map<string, Row[]>();
	for (const row of rows) {
		if (row.amka.length !== 11) continue;
		const bucket = amkaGroups.get(row.amka);
		if (bucket) bucket.push(row);
		else amkaGroups.set(row.amka, [row]);
	}
	const sharedAmka = [...amkaGroups.entries()]
		.filter(([, group]) => new Set(group.map((row) => personNameKey(row))).size > 1)
		.sort((a, b) => a[0].localeCompare(b[0]));

	// A mobile on many cards is neither a duplicate nor an error: the backfill
	// leaves a review note on each of them (see flagSharedCellphones).
	const sharedPhone = rows.filter((row) => /κοινόχρηστο κινητό/.test(row.review_note));

	return { rows, withAm, orphans, missingAm, waiting, invalidAm, sameAmkaName, samePhone, sameNameOnly, sharedAmka, sharedPhone };
}

// ---------------------------------------------------------------------------
// Document model (rendered to Markdown and to HTML from the same source)
// ---------------------------------------------------------------------------

type Table = { columns: string[]; rows: string[][]; footnote?: string };
type Block =
	| { kind: "h2"; text: string }
	| { kind: "h3"; text: string }
	| { kind: "p"; text: string }
	| { kind: "ul"; items: string[] }
	| { kind: "table"; table: Table };
type Doc = { title: string; meta?: [string, string][]; intro?: string[]; blocks: Block[]; footer?: string };

function renderMarkdown(doc: Doc): string {
	const lines: string[] = [`# ${doc.title}`, ""];
	for (const [label, value] of doc.meta ?? []) lines.push(`**${label}:** ${value}`);
	if (doc.meta?.length) lines.push("");
	for (const paragraph of doc.intro ?? []) lines.push(paragraph, "");
	for (const block of doc.blocks) {
		if (block.kind === "h2") lines.push(`## ${block.text}`, "");
		else if (block.kind === "h3") lines.push(`### ${block.text}`, "");
		else if (block.kind === "p") lines.push(block.text, "");
		else if (block.kind === "ul") lines.push(...block.items.map((item) => `- ${item}`), "");
		else {
			const { columns, rows, footnote } = block.table;
			lines.push(`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`);
			for (const row of rows) lines.push(`| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`);
			lines.push("");
			if (footnote) lines.push(footnote, "");
		}
	}
	if (doc.footer) lines.push("---", "", doc.footer);
	return (
		lines
			.join("\n")
			.replace(/\n{3,}/g, "\n\n")
			.trimEnd() + "\n"
	);
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** `**bold**` → `<strong>` (the Markdown writer passes it through untouched). */
const inline = (value: string) => escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

function renderHtml(doc: Doc): string {
	const body: string[] = [`<h1>${inline(doc.title)}</h1>`];
	if (doc.meta?.length) {
		body.push('<dl class="meta">');
		for (const [label, value] of doc.meta) body.push(`<dt>${inline(label)}:</dt><dd>${inline(value)}</dd>`);
		body.push("</dl>");
	}
	for (const paragraph of doc.intro ?? []) body.push(`<p>${inline(paragraph)}</p>`);
	for (const block of doc.blocks) {
		if (block.kind === "h2") body.push(`<h2>${inline(block.text)}</h2>`);
		else if (block.kind === "h3") body.push(`<h3>${inline(block.text)}</h3>`);
		else if (block.kind === "p") body.push(`<p>${inline(block.text)}</p>`);
		else if (block.kind === "ul") body.push(`<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
		else {
			const { columns, rows, footnote } = block.table;
			if (rows.length === 0) body.push('<p class="empty">(καμία)</p>');
			else {
				body.push("<table>");
				body.push(`<thead><tr>${columns.map((column) => `<th>${inline(column)}</th>`).join("")}</tr></thead>`);
				body.push(`<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`);
				body.push("</table>");
			}
			if (footnote) body.push(`<p class="footnote">${inline(footnote)}</p>`);
		}
	}
	if (doc.footer) body.push(`<hr><p class="footer">${inline(doc.footer)}</p>`);

	return `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<style>
	@page { size: A4; margin: 16mm 14mm; }
	body { font-family: "DejaVu Sans", Carlito, Calibri, Arial, sans-serif; font-size: 10pt; line-height: 1.45; color: #111; }
	h1 { font-size: 15pt; margin: 0 0 8px; }
	h2 { font-size: 12pt; margin: 16px 0 6px; break-after: avoid; }
	h2.page { break-before: page; }
	h3 { font-size: 10.5pt; margin: 12px 0 4px; break-after: avoid; }
	p { margin: 0 0 7px; }
	ul { margin: 0 0 8px; padding-left: 18px; }
	li { margin: 1px 0; }
	dl.meta { display: grid; grid-template-columns: max-content 1fr; gap: 0 8px; margin: 0 0 10px; }
	dl.meta dt { font-weight: bold; }
	dl.meta dd { margin: 0; }
	table { border-collapse: collapse; width: 100%; font-size: 8.6pt; margin: 0 0 10px; }
	th, td { border: 0.6pt solid #999; padding: 2.4px 4px; text-align: left; vertical-align: top; }
	th { background: #eee; font-weight: bold; }
	thead { display: table-header-group; }
	tr { break-inside: avoid; }
	.footnote, .empty { font-size: 9pt; color: #444; margin: -4px 0 10px; }
	.footer { font-size: 8.5pt; color: #555; }
</style></head>
<body>
${body.join("\n")}
</body></html>
`;
}

// ---------------------------------------------------------------------------
// The two documents
// ---------------------------------------------------------------------------

const REPORTS = [
	{ slug: "mathitologio-ektremotites", title: "Μαθητολόγιο — εκκρεμότητες προς διόρθωση" },
	{ slug: "mathitologio-ektremotites-parartima", title: "Παράρτημα — αναλυτικές λίστες" },
] as const;

function summaryDoc(a: Analysis, counts: { pupils: number; enrollments: number }, date: Date): Doc {
	const splits = a.rows.filter((row) => row.split_from_am !== null);
	// "Καρτέλες που χρειάζονται διόρθωση" = every card the secretaries must touch:
	// no ΑΜ, an unusable ΑΜ, or a second person sharing an ΑΜ.
	const open = a.missingAm.length + a.waiting.length + a.invalidAm.length + splits.length;
	// Only same-ΑΜΚΑ and same-mobile pairs are duplicates to merge; a shared name
	// alone is a homonym (the owner confirmed those are different students).
	const duplicates = a.sameAmkaName.length + a.samePhone.length;
	const currentYear = a.missingAm.filter((row) => lastYearOf(row) === "2026-2027").length;

	const blocks: Block[] = [];

	blocks.push({ kind: "h2", text: `1. Καρτέλες χωρίς ΑΜ — ${el(a.missingAm.length + a.waiting.length)}` });
	if (a.missingAm.length) {
		const older = a.missingAm.length - currentYear;
		blocks.push({
			kind: "ul",
			items: [
				`**${a.missingAm.length} νέες εγγραφές** που δεν πήραν ΑΜ` +
					(older === 0
						? `, όλες για το τρέχον έτος 2026-2027.`
						: currentYear === 0
							? `, όλες από παλαιότερα έτη.`
							: `: οι ${currentYear} αφορούν το τρέχον έτος 2026-2027, οι υπόλοιπες ${older} παλαιότερα έτη.`),
			],
		});
	}
	if (a.waiting.length) {
		blocks.push({ kind: "ul", items: [`**${a.waiting.length} εγγραφές σε εκκρεμότητα («Αναμονή»)**: ${a.waiting.map(nameOf).join(", ")}.`] });
	}
	if (!a.missingAm.length && !a.waiting.length) blocks.push({ kind: "p", text: "Καμία." });
	else blocks.push({ kind: "p", text: "→ Να τους αποδοθεί ΑΜ. Ονόματα, ΑΜΚΑ και τηλέφωνα στο Παράρτημα Α." });

	blocks.push({ kind: "h2", text: `2. Λανθασμένα ΑΜ — ${el(a.invalidAm.length)}` });
	if (a.invalidAm.length) {
		blocks.push({ kind: "p", text: "Καταχωρημένα ΑΜ που δεν είναι έγκυρα, ή σημειώσεις που δεν δίνουν ΑΜ:" });
		blocks.push({ kind: "ul", items: a.invalidAm.map((row) => `${nameOf(row)} — «${rejectedAmOf(row)}»`) });
		blocks.push({ kind: "p", text: "→ Να αντικατασταθούν με το σωστό ΑΜ." });
	} else blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `3. Ίδιο ΑΜ σε δύο διαφορετικά πρόσωπα — ${el(splits.length)}` });
	if (splits.length) {
		const ownerOf = new Map(a.rows.filter((row) => row.am !== null).map((row) => [row.am!, row]));
		blocks.push({ kind: "p", text: "Το δεύτερο πρόσωπο κρατά προσωρινό κωδικό και χρειάζεται δικό του ΑΜ:" });
		blocks.push({
			kind: "table",
			table: {
				columns: ["ΑΜ", "Κάτοχος ΑΜ", "Δεύτερο πρόσωπο"],
				rows: splits.map((row) => [String(row.split_from_am), nameOf(ownerOf.get(row.split_from_am!) ?? row), nameOf(row)]),
			},
		});
	} else blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `4. Διπλές καρτέλες — ${el(duplicates)} προς συνένωση` });
	const pairLine = (pair: Pair<Row>) => `ΑΜ ${pair.a.am} & ${pair.b.am} — ${nameOf(pair.a)}`;
	if (a.sameAmkaName.length) {
		blocks.push({ kind: "h3", text: `α) Ίδιο ΑΜΚΑ — ο ίδιος μαθητής με δύο ΑΜ (${a.sameAmkaName.length}).` });
		blocks.push({ kind: "ul", items: a.sameAmkaName.map(pairLine) });
	}
	if (a.samePhone.length) {
		blocks.push({ kind: "h3", text: `β) Ίδιο κινητό — μάλλον ο ίδιος μαθητής (${a.samePhone.length}).` });
		blocks.push({ kind: "p", text: "Προς επιβεβαίωση και συνένωση:" });
		blocks.push({ kind: "ul", items: a.samePhone.map(pairLine) });
	}
	if (a.sameNameOnly.length) {
		blocks.push({ kind: "h3", text: `γ) Ίδιο ονοματεπώνυμο χωρίς άλλο κοινό στοιχείο (${a.sameNameOnly.length}) — πιθανές συνωνυμίες.` });
		blocks.push({
			kind: "p",
			text: "Πρόκειται συνήθως για συνωνυμίες (δύο διαφορετικοί μαθητές με το ίδιο ονοματεπώνυμο) — δεν απαιτείται ενέργεια, εκτός αν υπάρχει άλλη ένδειξη:",
		});
		blocks.push({ kind: "ul", items: a.sameNameOnly.map(pairLine) });
	}
	if (!duplicates && !a.sameNameOnly.length) blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `5. Ίδιο ΑΜΚΑ σε διαφορετικά πρόσωπα — ${el(a.sharedAmka.length)}` });
	if (a.sharedAmka.length) {
		blocks.push({
			kind: "ul",
			items: a.sharedAmka.map(([amka, group]) => `**${amka}** — ${group.map((row) => `${nameOf(row)} (ΑΜ ${codeOf(row)})`).join(" & ")}`),
		});
		blocks.push({ kind: "p", text: "→ Σε κάθε περίπτωση το ΑΜΚΑ ανήκει σε ένα μόνο πρόσωπο· τα υπόλοιπα χρειάζονται διόρθωση." });
	} else blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `6. Κοινόχρηστο κινητό — ${el(a.sharedPhone.length)}` });
	if (a.sharedPhone.length) {
		blocks.push({
			kind: "p",
			text: `Ο ίδιος αριθμός κινητού εμφανίζεται σε πολλές καρτέλες (συνήθως τηλέφωνο σχολής ή γονέα, αλλά μπορεί και λάθος καταχώρηση). Δεν αλλάζει τίποτα σε αυτές τις καρτέλες — ελέγξτε αν ο αριθμός είναι σωστός:`,
		});
		blocks.push({ kind: "ul", items: [`${a.sharedPhone.map(nameOf).join(", ")}.`] });
		blocks.push({ kind: "p", text: "→ Αν ο αριθμός ανήκει σε έναν μόνο μαθητή, διορθώστε τις υπόλοιπες καρτέλες. Αναλυτικά στο Παράρτημα ΣΤ." });
	} else blocks.push({ kind: "p", text: "Καμία." });

	const amkaCleared = a.rows.filter((row) => /μη έγκυρο ΑΜΚΑ/.test(row.review_note));
	if (amkaCleared.length) {
		blocks.push({ kind: "h2", text: `7. Ελλιπές ΑΜΚΑ — ${el(amkaCleared.length)}` });
		blocks.push({ kind: "ul", items: amkaCleared.map((row) => `${codeOf(row)} — ${nameOf(row)}`) });
		blocks.push({ kind: "p", text: "→ Το καταχωρημένο ΑΜΚΑ δεν είχε 11 ψηφία και δεν μπορεί να χρησιμοποιηθεί· να συμπληρωθεί το σωστό." });
	}

	return {
		title: REPORTS[0].title,
		meta: [
			["Προς", "Γραμματεία Σχολής"],
			["Ημερομηνία", greekDate(date)],
			[
				"Θέμα",
				[
					`${el(open)} καρτέλες που χρειάζονται διόρθωση`,
					...(duplicates ? [`${el(duplicates)} διπλές καρτέλες`] : []),
					...(a.sharedPhone.length ? [`${el(a.sharedPhone.length)} με κοινόχρηστο κινητό`] : []),
					...(a.sharedAmka.length ? [`${el(a.sharedAmka.length)} ΑΜΚΑ σε πολλά πρόσωπα`] : []),
				].join(" + "),
			],
		],
		intro: [
			`Στο μαθητολόγιο είναι καταχωρημένοι **${el(counts.pupils)} μαθητές** (${el(counts.enrollments)} εγγραφές).`,
			`Εκκρεμούν **${el(open)} καρτέλες**${duplicates ? ` και εντοπίστηκαν **${el(duplicates)} διπλές καρτέλες**` : ""}. Αναλυτικά:`,
		],
		blocks,
		footer: `**Συνημμένο:** «Παράρτημα — αναλυτικές λίστες» με όλα τα ονόματα, τα ΑΜΚΑ και τα τηλέφωνα ανά περίπτωση.`,
	};
}

function appendixDoc(a: Analysis, counts: { pupils: number; enrollments: number }, date: Date): Doc {
	const blocks: Block[] = [];

	blocks.push({ kind: "h2", text: `Α. Καρτέλες χωρίς ΑΜ (${el(a.missingAm.length + a.waiting.length)})` });
	if (a.missingAm.length) {
		blocks.push({ kind: "h3", text: `Α1. Νέες εγγραφές που δεν έχουν πάρει ΑΜ (${a.missingAm.length})` });
		blocks.push({
			kind: "table",
			table: {
				columns: ["Κωδικός", "Επώνυμο", "Όνομα", "Πατρώνυμο", "ΑΜΚΑ", "Κινητό", "Τελευταίο έτος"],
				rows: a.missingAm.map((row) => [row.orphan_code, row.last_name, row.first_name, row.fathers_name, amkaOf(row), phonesOf(row), lastYearOf(row)]),
			},
		});
	}
	if (a.waiting.length) {
		blocks.push({ kind: "h3", text: `Α2. Εγγραφές σε εκκρεμότητα — «Αναμονή» (${a.waiting.length})` });
		blocks.push({
			kind: "table",
			table: {
				columns: ["Κωδικός", "Επώνυμο", "Όνομα", "Πατρώνυμο", "ΑΜΚΑ", "Κινητό", "Τελευταίο έτος"],
				rows: a.waiting.map((row) => [row.orphan_code, row.last_name, row.first_name, row.fathers_name, amkaOf(row), phonesOf(row), lastYearOf(row)]),
			},
		});
	}
	if (!a.missingAm.length && !a.waiting.length) blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `Β. Λανθασμένα / μη έγκυρα ΑΜ (${el(a.invalidAm.length)})` });
	blocks.push({
		kind: "table",
		table: {
			columns: ["Επώνυμο", "Όνομα", "Καταχωρημένο ΑΜ", "ΑΜΚΑ", "Κινητό", "Έτη"],
			rows: a.invalidAm.map((row) => [row.last_name, row.first_name, rejectedAmOf(row), amkaOf(row), phonesOf(row), yearsOf(row)]),
			footnote: "Ο κωδικός στη στήλη «Καταχωρημένο ΑΜ» είναι ό,τι έχει σήμερα η καρτέλα· το σωστό ΑΜ λείπει.",
		},
	});

	const splits = a.rows.filter((row) => row.split_from_am !== null);
	blocks.push({ kind: "h2", text: `Γ. Ίδιο ΑΜ σε δύο διαφορετικά πρόσωπα (${el(splits.length)})` });
	if (splits.length) {
		const ownerOf = new Map(a.rows.filter((row) => row.am !== null).map((row) => [row.am!, row]));
		blocks.push({ kind: "p", text: "Το δεύτερο πρόσωπο έχει προσωρινό κωδικό και χρειάζεται δικό του ΑΜ." });
		blocks.push({
			kind: "table",
			table: {
				columns: ["ΑΜ", "Κάτοχος ΑΜ", "Δεύτερο πρόσωπο", "Προσωρινός κωδικός", "ΑΜΚΑ", "Κινητό", "Έτη"],
				rows: splits.map((row) => [
					String(row.split_from_am),
					nameOf(ownerOf.get(row.split_from_am!) ?? row),
					nameOf(row),
					row.orphan_code,
					amkaOf(row),
					phonesOf(row),
					yearsOf(row),
				]),
			},
		});
	} else blocks.push({ kind: "p", text: "Καμία." });

	const pairColumns = ["ΑΜ", "Ονοματεπώνυμο (1η καρτέλα)", "ΑΜΚΑ", "Κινητό", "Έτη", "ΑΜ", "Ονοματεπώνυμο (2η καρτέλα)", "ΑΜΚΑ", "Κινητό", "Έτη"];
	const pairRows = (pairs: Pair<Row>[]) =>
		pairs.map((pair) => [
			String(pair.a.am),
			nameOf(pair.a),
			amkaOf(pair.a),
			phonesOf(pair.a),
			yearsOf(pair.a),
			String(pair.b.am),
			nameOf(pair.b),
			amkaOf(pair.b),
			phonesOf(pair.b),
			yearsOf(pair.b),
		]);
	const duplicates = a.sameAmkaName.length + a.samePhone.length;
	blocks.push({
		kind: "h2",
		text: `Δ. Διπλές καρτέλες (${el(duplicates)} προς συνένωση${a.sameNameOnly.length ? `, ${el(a.sameNameOnly.length)} πιθανές συνωνυμίες` : ""})`,
	});
	if (a.sameAmkaName.length) {
		blocks.push({ kind: "h3", text: `Δ1. Ίδιο ΑΜΚΑ — ίδιο πρόσωπο με δύο ΑΜ (${a.sameAmkaName.length})` });
		blocks.push({ kind: "table", table: { columns: pairColumns, rows: pairRows(a.sameAmkaName) } });
	}
	if (a.samePhone.length) {
		blocks.push({ kind: "h3", text: `Δ2. Ίδιο κινητό, διαφορετικό ή κενό ΑΜΚΑ — προς συνένωση (${a.samePhone.length})` });
		blocks.push({ kind: "table", table: { columns: pairColumns, rows: pairRows(a.samePhone) } });
	}
	if (a.sameNameOnly.length) {
		blocks.push({ kind: "h3", text: `Δ3. Ίδιο ονοματεπώνυμο χωρίς άλλο κοινό στοιχείο — πιθανές συνωνυμίες (${a.sameNameOnly.length})` });
		blocks.push({
			kind: "p",
			text: "Δύο διαφορετικοί μαθητές με το ίδιο ονοματεπώνυμο: δεν απαιτείται ενέργεια, εκτός αν υπάρχει άλλη ένδειξη ότι πρόκειται για το ίδιο πρόσωπο.",
		});
		blocks.push({ kind: "table", table: { columns: pairColumns, rows: pairRows(a.sameNameOnly) } });
	}
	if (!duplicates) blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `Ε. Ίδιο ΑΜΚΑ σε διαφορετικά πρόσωπα (${el(a.sharedAmka.length)} ΑΜΚΑ)` });
	if (a.sharedAmka.length) {
		blocks.push({
			kind: "table",
			table: {
				columns: ["ΑΜΚΑ", "Ονοματεπώνυμο", "ΑΜ", "Κινητό"],
				rows: a.sharedAmka.flatMap(([amka, group]) => group.map((row) => [amka, nameOf(row), codeOf(row), phonesOf(row)])),
				footnote: "Το ίδιο ΑΜΚΑ σε περισσότερες από μία καρτέλες· μία μόνο είναι σωστή.",
			},
		});
	} else blocks.push({ kind: "p", text: "Καμία." });

	blocks.push({ kind: "h2", text: `ΣΤ. Κοινόχρηστο κινητό (${el(a.sharedPhone.length)})` });
	if (a.sharedPhone.length) {
		blocks.push({
			kind: "table",
			table: {
				columns: ["ΑΜ", "Επώνυμο", "Όνομα", "Κινητό", "Έτη"],
				rows: a.sharedPhone.map((row) => [codeOf(row), row.last_name, row.first_name, phonesOf(row), yearsOf(row)]),
				footnote:
					"Ο αριθμός κινητού είναι ίδιος σε όλες τις παραπάνω καρτέλες. Συνήθως πρόκειται για τηλέφωνο σχολής ή γονέα· ελέγξτε μόνο αν κάποια καταχώρηση είναι λανθασμένη.",
			},
		});
	} else blocks.push({ kind: "p", text: "Καμία." });

	const amkaCleared = a.rows.filter((row) => /μη έγκυρο ΑΜΚΑ/.test(row.review_note));
	if (amkaCleared.length) {
		blocks.push({ kind: "h2", text: `Ζ. Ελλιπές ΑΜΚΑ (${el(amkaCleared.length)})` });
		blocks.push({
			kind: "table",
			table: {
				columns: ["Κωδικός", "Επώνυμο", "Όνομα", "Πατρώνυμο", "Κινητό", "Έτη"],
				rows: amkaCleared.map((row) => [codeOf(row), row.last_name, row.first_name, row.fathers_name, phonesOf(row), yearsOf(row)]),
			},
		});
	}

	return {
		title: REPORTS[1].title,
		intro: [`Μαθητολόγιο, κατάσταση ${shortDate(date)}. Σύνολο μαθητών: ${el(counts.pupils)}, εγγραφές: ${el(counts.enrollments)}.`],
		blocks,
	};
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

async function printPdf(htmlPath: string, pdfPath: string): Promise<void> {
	const chrome = Bun.which("google-chrome") ?? Bun.which("chromium") ?? Bun.which("chromium-browser");
	if (!chrome) throw new Error("google-chrome/chromium not found — cannot print the PDF (use --no-pdf to skip).");
	const child = Bun.spawn(
		[chrome, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (code !== 0 || !existsSync(pdfPath)) throw new Error(`Chrome failed to print ${path.basename(pdfPath)} (exit ${code}): ${stderr.slice(0, 300)}`);
	console.log(`✓ ${path.relative(REPO_ROOT, pdfPath)}`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const client: D1Client = openTarget(args.db);
	try {
		const counts = {
			pupils: Number((await client.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupils"))[0]?.n ?? 0),
			enrollments: Number((await client.query<{ n: number }>("SELECT COUNT(*) AS n FROM pupil_enrollments"))[0]?.n ?? 0),
		};
		const rows = await client.query<Row>(SELECT_PUPILS);
		const analysis = classify(rows);

		console.log(`Source : ${resolveTarget(args.db).label}`);
		console.log(`Data   : ${el(counts.pupils)} pupil(s), ${el(counts.enrollments)} enrollment(s), ${el(analysis.orphans.length)} orphan(s)`);

		mkdirSync(args.out, { recursive: true });
		const htmlDir = path.join(args.out, ".html");
		mkdirSync(htmlDir, { recursive: true });

		const docs: [Doc, string][] = [
			[summaryDoc(analysis, counts, args.date), REPORTS[0].slug],
			[appendixDoc(analysis, counts, args.date), REPORTS[1].slug],
		];
		for (const [doc, slug] of docs) {
			const mdPath = path.join(args.out, `${slug}.md`);
			writeFileSync(mdPath, renderMarkdown(doc), "utf8");
			console.log(`✓ ${path.relative(REPO_ROOT, mdPath)}`);
			if (!args.pdf) continue;
			const htmlPath = path.join(htmlDir, `${slug}.html`);
			writeFileSync(htmlPath, renderHtml(doc), "utf8");
			await printPdf(htmlPath, path.join(args.out, `${slug}.pdf`));
		}
		if (args.pdf) console.log(`  (HTML sources: ${path.relative(REPO_ROOT, htmlDir)}/)`);
	} finally {
		client.close();
	}
}

try {
	await main();
} catch (error) {
	console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}

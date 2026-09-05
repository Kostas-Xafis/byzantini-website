#!/usr/bin/env bun
/**
 * googleReviews.ts — Συλλογή κριτικών Google (Places API New)
 * ============================================================
 *
 * Γιατί υπάρχει: το Google Places API επιστρέφει μόνο ~5 πιο πρόσφατες
 * κριτικές ανά αίτημα, ενώ η σχολή έχει δεκάδες. Το script τρέχει περιοδικά
 * (π.χ. κάθε εβδομάδα/μήνα) και κρατάει "αρχείο" (archive) στη σελίδα εξόδου:
 * κάθε νέα κριτική προστίθεται, οι ήδη γνωστές δεν επαναλαμβάνονται, οπότε
 * με τον χρόνο μαζεύονται ΟΛΕΣ οι κριτικές που έχουν κείμενο.
 *
 * Βήματα:
 *   1. Βρίσκει το place (text search) ή δέχεται place id.
 *   2. Παίρνει λεπτομέρειες + κριτικές (μέχρι 5 ανά κλήση).
 *   3. Κρατάει μόνο κριτικές με κείμενο (οι rating-only μένουν εκτός).
 *   4. Συγχωνεύει με το υπάρχον αρχείο (dedupe από το review id).
 *   5. Γράφει: reviews.json (δομημένα), reviews.csv (Excel),
 *      reviews.md (φύλλο για "refine" της καθεμιάς ξεχωριστά).
 *
 * Χρήση (κλειδί: env GOOGLE_MAPS_KEY ή .dev.vars / .env — δεν τυπώνεται ποτέ):
 *   bun run google:reviews                          # σχολή (default)
 *   bun run google:reviews -- --place-id "ChIJ..."  # συγκεκριμένο place
 *   bun run google:reviews -- --query "..."         # αναζήτηση με όνομα
 *   bun run google:reviews -- --out ./out           # άλλος φάκελος εξόδου
 *
 * Σημείωση: το πεδίο "text" μιας κριτικής μπορεί να είναι αυτόματη μετάφραση·
 * όταν υπάρχει "originalText" προτιμάται το αυθεντικό κείμενο (και τα δύο
 * αποθηκεύονται στο JSON).
 *
 * Σημείωση δεοντολογίας: δημοσιευμένο περιεχόμενο κριτικών τρίτων (ονόματα,
 * κείμενα) δεν πρέπει να δημοσιεύεται χωρίς άδεια — το αρχείο μένει σε
 * gitignored φάκελο.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Σταθερές & τύποι
// ---------------------------------------------------------------------------

const API_BASE = "https://places.googleapis.com/v1";

/** Default: το place της σχολής (βρέθηκε με text search, ★5 — 47 κριτικές). */
const DEFAULT_PLACE_ID = "ChIJQbVuWBqjoRQR5gEUDJtl4W4";
const DEFAULT_QUERY = "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής Μεταμόρφωση";
const DEFAULT_OUT = "google-reviews";

const PLACE_FIELDS = ["id", "displayName", "formattedAddress", "rating", "userRatingCount", "googleMapsUri"].join(",");
const PLACE_FIELDS_WITH_REVIEWS = [...PLACE_FIELDS.split(","), "reviews"].join(",");
/** Το searchText απαντάει { places: [...] } → το field mask θέλει πρόθεμα "places.". */
const SEARCH_FIELDS = PLACE_FIELDS.split(",")
	.map((f) => `places.${f}`)
	.join(",");

interface ApiTypeValueText {
	text?: string;
	languageCode?: string;
}

interface ApiAuthorAttribution {
	displayName?: string;
	uri?: string;
	photoUri?: string;
}

interface ApiReview {
	name?: string;
	relativePublishTimeDescription?: string;
	rating?: number;
	text?: ApiTypeValueText;
	originalText?: ApiTypeValueText;
	authorAttribution?: ApiAuthorAttribution;
	publishTime?: string;
	googleMapsUri?: string;
}

interface ApiPlace {
	id?: string;
	displayName?: { text?: string };
	formattedAddress?: string;
	rating?: number;
	userRatingCount?: number;
	reviews?: ApiReview[];
	googleMapsUri?: string;
}

interface ApiErrorResponse {
	error?: { code?: number; message?: string; status?: string };
}

/** Μορφή εγγραφής στο αρχείο — κατάλληλη για μελλοντική σελίδα "Μαρτυρίες". */
interface ReviewRecord {
	/** Μοναδικό id κριτικής (Google). */
	id: string;
	/** Όνομα συγγραφέα (αποδόθηκε από τον Google account). */
	author: string;
	/** 1–5 αστέρια. */
	rating: number;
	/** ISO datetime δημοσίευσης. */
	publishTime: string;
	/** Ανθρώπινη περιγραφή ημερομηνίας (π.χ. "πριν 2 μήνες"). */
	dateLabel: string;
	/** Κείμενο προς χρήση: αυθεντικό αν υπάρχει, αλλιώς η αυτόματη μετάφραση. */
	text: string;
	/** Αυτόματη μετάφραση του Google (π.χ. στα αγγλικά) όταν διαφέρει από το αυθεντικό. */
	translatedText: string;
	/** Γλώσσα του κειμένου που επελέγη. */
	textLanguage: string;
	/** Σύνδεσμος στην κριτική. */
	reviewUrl: string;
	/** Σύνδεσμος στο προφίλ του συγγραφέα. */
	authorUrl: string;
	/** Φωτογραφία προφίλ (προαιρετικά). */
	photoUrl: string;
	/** Πότε πρωτοσυλλέχθηκε από εμάς (για εντοπισμό νέων). */
	firstSeenAt: string;
}

interface PlaceMeta {
	id: string;
	name: string;
	address: string;
	rating: number;
	ratingCount: number;
	url: string;
}

interface Archive {
	/** Πότε έτρεξε τελευταία φορά το script. */
	generatedAt: string;
	place: PlaceMeta;
	reviews: ReviewRecord[];
}

interface CliArgs {
	placeId?: string;
	query?: string;
	out: string;
	help: boolean;
}

// ---------------------------------------------------------------------------
// Υποβοηθητικά
// ---------------------------------------------------------------------------

function fail(message: string): never {
	console.error(`✖ ${message}`);
	process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { out: DEFAULT_OUT, help: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--help" || a === "-h") args.help = true;
		else if (a === "--place-id") args.placeId = argv[++i];
		else if (a === "--query") args.query = argv[++i];
		else if (a === "--out") args.out = argv[++i];
		else fail(`Άγνωστο όρισμα: ${a} (−-help για βοήθεια)`);
	}
	return args;
}

/** Κλειδί API: env → .dev.vars → .env. Ποτέ δεν τυπώνεται. */
function loadApiKey(): string {
	const fromEnv = process.env.GOOGLE_MAPS_KEY?.trim();
	if (fromEnv) return fromEnv;
	for (const file of [".dev.vars", ".env"]) {
		if (!existsSync(file)) continue;
		for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
			const eq = line.indexOf("=");
			if (eq <= 0 || line.slice(0, eq).trim() !== "GOOGLE_MAPS_KEY") continue;
			const value = line
				.slice(eq + 1)
				.trim()
				.replace(/^"|"$/g, "");
			if (value) return value;
		}
	}
	fail("Δεν βρέθηκε κλειδί API: βάλτε GOOGLE_MAPS_KEY στο .dev.vars (ή env) και ξανατρέξτε.");
}

async function callApi<T>(url: string, key: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			"X-Goog-Api-Key": key,
			"Content-Type": "application/json",
			// Ζητάμε ελληνικές ετικέτες ημερομηνιών/μεταφράσεις όταν το υποστηρίζει το API.
			"Accept-Language": "el-GR,el;q=0.9,en;q=0.5",
			...init?.headers,
		},
	});
	const body = (await res.json()) as T & ApiErrorResponse;
	if (!res.ok || body?.error) {
		const e = body?.error;
		fail(`Το Google API απέρριψε το αίτημα (${res.status}): ${e?.status ?? "?"} — ${e?.message ?? "?"}`);
	}
	return body;
}

/** Βρίσκει candidate places με text search (χωρίς κριτικές). */
async function searchPlaces(key: string, query: string): Promise<ApiPlace[]> {
	const body = await callApi<{ places?: ApiPlace[] }>(`${API_BASE}/places:searchText`, key, {
		method: "POST",
		headers: { "X-Goog-FieldMask": SEARCH_FIELDS },
		body: JSON.stringify({ textQuery: query }),
	});
	return body.places ?? [];
}

/** Λεπτομέρειες place + κριτικές (μέχρι 5 ανά κλήση — περιορισμός Google). */
async function getPlaceDetails(key: string, placeId: string): Promise<ApiPlace> {
	return callApi<ApiPlace>(`${API_BASE}/places/${encodeURIComponent(placeId)}`, key, {
		headers: { "X-Goog-FieldMask": PLACE_FIELDS_WITH_REVIEWS },
	});
}

function toIso(publishTime?: string): string {
	return publishTime ?? "";
}

/** Χρονική τιμή για ταξινόμηση: κόβει τα μικροδευτερόλεπτα (9 ψηφία) του Google Timestamp. */
function sortableTime(iso: string): number {
	const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,9})Z?$/.exec(iso);
	if (!m) return Date.parse(iso) || 0;
	return Date.parse(`${m[1]}.${(m[2] + "000").slice(0, 3)}Z`);
}

/** Κανονικοποίηση κριτικής του API → εγγραφή αρχείου. null αν δεν έχει κείμενο. */
function normalizeReview(review: ApiReview, now: string): ReviewRecord | null {
	const preferred = review.originalText?.text?.trim() || review.text?.text?.trim() || "";
	if (!preferred) return null; // rating-only κριτική — εκτός (ζητήθηκαν μόνο με κείμενο)
	const text = review.text?.text?.trim() || "";
	return {
		id: review.name ?? `${review.authorAttribution?.displayName ?? ""}|${review.publishTime ?? ""}`,
		author: review.authorAttribution?.displayName?.trim() || "Ανώνυμος χρήστης",
		rating: review.rating ?? 5,
		publishTime: toIso(review.publishTime),
		dateLabel: review.relativePublishTimeDescription ?? "",
		text: preferred,
		translatedText: text !== preferred ? text : "",
		textLanguage: review.originalText?.languageCode ?? review.text?.languageCode ?? "",
		reviewUrl: review.googleMapsUri ?? "",
		authorUrl: review.authorAttribution?.uri ?? "",
		photoUrl: review.authorAttribution?.photoUri ?? "",
		firstSeenAt: now,
	};
}

function loadArchive(path: string): Archive | null {
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Archive;
		if (!Array.isArray(parsed.reviews)) return null;
		return parsed;
	} catch {
		return null;
	}
}

/** Συγχώνευση: νέες κρατούν firstSeenAt, γνωστές ανανεώνονται, ταξινόμηση νεότερες πρώτες. */
function mergeReviews(existing: Archive | null, fetched: ReviewRecord[], now: string): Archive {
	const byId = new Map<string, ReviewRecord>();
	for (const r of existing?.reviews ?? []) byId.set(r.id, r);
	let fresh = 0;
	for (const r of fetched) {
		const known = byId.get(r.id);
		if (known) {
			// Ίδια κριτική — κρατάμε την πρώτη εμφάνιση, ανανεωμένα πεδία.
			byId.set(r.id, { ...known, ...r, firstSeenAt: known.firstSeenAt });
		} else {
			byId.set(r.id, r);
			fresh++;
		}
	}
	const reviews = [...byId.values()].sort((a, b) => sortableTime(b.publishTime) - sortableTime(a.publishTime));
	return {
		generatedAt: now,
		place: existing?.place ?? {
			id: "",
			name: "",
			address: "",
			rating: 0,
			ratingCount: 0,
			url: "",
		},
		reviews,
	};
}

function csvEscape(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function writeCsv(path: string, reviews: ReviewRecord[]): void {
	const header = ["id", "author", "rating", "publishTime", "dateLabel", "text", "translatedText", "language", "reviewUrl", "authorUrl"];
	const rows = reviews.map((r) =>
		[r.id, r.author, String(r.rating), r.publishTime, r.dateLabel, r.text, r.translatedText, r.textLanguage, r.reviewUrl, r.authorUrl]
			.map(csvEscape)
			.join(","),
	);
	writeFileSync(path, `\uFEFF${[header.join(","), ...rows].join("\n")}\n`, "utf8"); // BOM για Excel
}

function writeMarkdown(path: string, archive: Archive, textOnlyCount: number, totalRatingOnly: number): void {
	const { place, reviews } = archive;
	const header = [
		`# Κριτικές Google — ${place.name || "Σχολή"}`,
		"",
		`**Μέσος όρος:** ★${place.rating} · **Σύνολο κριτικών στο Google:** ${place.ratingCount} · ` +
			`**Με κείμενο (συλλεγμένες):** ${reviews.length} · **Χωρίς κείμενο (εκτός):** ${textOnlyCount}/${totalRatingOnly}`,
		"",
		"> Φύλλο εργασίας για «refinement»: για κάθε κριτική, σημειώστε τη βελτιωμένη",
		"> εκδοχή (καθαρό ελληνικό κείμενο), τον ρόλο/πρόσωπο και το αν θα δημοσιευθεί.",
		"",
	].join("\n");

	const body = reviews
		.map((r, i) => {
			const stars = "★".repeat(r.rating);
			const lines = [
				`### ${i + 1}. ${stars} — ${r.author}${r.dateLabel ? ` · ${r.dateLabel}` : ""}`,
				"",
				`> ${r.text.replaceAll("\n", "\n> ")}`,
				"",
				`**Γλώσσα πρωτότυπου:** ${r.textLanguage || "-"}${r.translatedText ? ` · (αυτόματη μετάφραση: ${r.translatedText.replaceAll("\n", " ")} )` : ""}`,
				"",
				"**Βελτιωμένη εκδοχή:** ",
				"",
				"**Ρόλος/πρόσωπο:** ",
				"",
				`Πηγή: ${r.reviewUrl || r.authorUrl || "-"}`,
				"",
				"---",
				"",
			];
			return lines.join("\n");
		})
		.join("\n");

	writeFileSync(path, `${header}\n${body}`, "utf8");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const args = parseArgs(Bun.argv.slice(2));
	if (args.help) {
		console.log(`Χρήση: bun run google:reviews [--place-id ID] [--query "κείμενο"] [--out φάκελος]`);
		return;
	}

	const now = new Date().toISOString();
	const key = loadApiKey();

	// 1) Εντοπισμός place.
	let place: ApiPlace;
	if (args.placeId) {
		place = await getPlaceDetails(key, args.placeId);
	} else {
		const query = args.query ?? DEFAULT_QUERY;
		const candidates = await searchPlaces(key, query);
		if (candidates.length === 0) fail(`Καμία αντιστοιχία για: ${query}`);
		if (candidates.length > 1) {
			console.log("ⓘ Βρέθηκαν περισσότερα αποτελέσματα — πείτε ποιο θέλετε με --place-id:");
			candidates.forEach((c) => console.log(`  ${c.id} | ${c.displayName?.text ?? "?"} | ${c.formattedAddress ?? "?"}`));
			process.exit(0);
		}
		place = await getPlaceDetails(key, candidates[0]?.id ?? "");
	}

	// 2) Place meta + κριτικές.
	const meta: PlaceMeta = {
		id: place.id ?? args.placeId ?? "",
		name: place.displayName?.text ?? "",
		address: place.formattedAddress ?? "",
		rating: place.rating ?? 0,
		ratingCount: place.userRatingCount ?? 0,
		url: place.googleMapsUri ?? "",
	};

	const fetched = (place.reviews ?? []).map((r) => normalizeReview(r, now)).filter((r): r is ReviewRecord => r !== null);
	let ratingOnly = 0;
	for (const r of place.reviews ?? []) {
		const text = (r.originalText?.text ?? r.text?.text ?? "").trim();
		if (!text) ratingOnly++;
	}

	// 3) Συγχώνευση με αρχείο.
	const outDir = resolve(args.out);
	mkdirSync(outDir, { recursive: true });
	const archivePath = resolve(outDir, "reviews.json");
	const existing = loadArchive(archivePath);
	const archive = mergeReviews(existing, fetched, now);
	archive.place = meta;
	const freshCount = fetched.filter((f) => !(existing?.reviews.some((e) => e.id === f.id) ?? false)).length;

	// 4) Εγγραφές εξόδου.
	writeFileSync(archivePath, JSON.stringify(archive, null, "\t"), "utf8");
	writeCsv(resolve(outDir, "reviews.csv"), archive.reviews);
	writeMarkdown(resolve(outDir, "reviews.md"), archive, ratingOnly, place.reviews?.length ?? 0);

	// 5) Σύνοψη.
	console.log(`✔ Place: ${meta.name} (${meta.address})`);
	console.log(`✔ Αξιολόγηση: ★${meta.rating} — ${meta.ratingCount} κριτικές στο Google`);
	console.log(`✔ Έλαβαν κείμενο από το API αυτή τη φορά: ${fetched.length} (χωρίς κείμενο: ${ratingOnly})`);
	console.log(`✔ Νέες στο αρχείο: ${freshCount} · Σύνολο στο αρχείο: ${archive.reviews.length}`);
	console.log(`✔ Αρχεία: ${outDir}/reviews.json, reviews.csv, reviews.md`);
	if (fetched.length < meta.ratingCount && fetched.length > 0) {
		console.log("ⓘ Το API επιστρέφει μόνο τις πιο πρόσφατες 5 κριτικές — ξανατρέξτε το script");
		console.log("   (π.χ. κάθε εβδομάδα) για να μαζευτούν σιγά-σιγά όλες οι κριτικές με κείμενο.");
	}
}

await main();

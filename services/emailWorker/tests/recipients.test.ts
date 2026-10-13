import { describe, expect, test } from "bun:test";
import { campaigns } from "../src/campaign/campaigns";
import { collectRecipients } from "../src/campaign/runner";
import {
	DEFAULT_SMS_MAX_SEGMENTS,
	type CampaignConfig,
	type SmsCampaignConfig,
} from "../src/campaign/types";
import { renderSmsText, resolveSmsFrom } from "../src/sms";
import { isGreekMobile, maskPhone, normalizeGreekPhone } from "../src/sms/phone";
import { countCharacters, detectEncoding, estimateSegments, type SmsEncoding } from "../src/sms/segments";
import { blockProviderFetch, makeCampaign, makeRecipient, readState, requireSmsDryRun, useScratchDirs } from "./helpers";

/**
 * Recipient-side tests: the phone funnel that decides which dirty D1 rows are
 * textable, both channels of `collectRecipients`, the segmentation arithmetic
 * that decides what a message costs, the compiled SMS copy itself, and the
 * sender ID Bird will accept.
 *
 * Safety: nothing here sends. The harness pins `BIRD_DRY_RUN=true` and blanks
 * `BIRD_API_KEY` at import, every SMS test re-asserts it through
 * `requireSmsDryRun()`, and the test that renders real copy wraps the render in
 * `blockProviderFetch()` so an unexpected provider call fails loudly rather
 * than leaving the process. No CLI subprocess is started and `--send` is never
 * passed.
 *
 * Every test here is table-driven on purpose: one test per file-level concern,
 * many rows inside it, so a behaviour and its boundaries sit in one place
 * instead of being scattered across dozens of near-identical `test` blocks.
 */
const dirs = useScratchDirs("recipients");

const NBSP = "\u00A0";

/** The E.164 shape Bird accepts, and the only shape that may reach an SMS send. */
const E164 = /^\+30\d{10}$/;

/**
 * A realistic regid: `pupils.registration_url` is a 32-character random token
 * (see EMAIL_QUALITY_REVIEW.md §4), not a short numeric id, and its length is
 * what decides how much of the 3-segment budget the link eats.
 */
const REGID = "k7Qm2Xr9Tb4Lz1Nc8Vd5Ws3Yh6Pj0Gf2";

const RENEWAL_SMS = "2026/upenthimisi_eggrafis.sms.txt";
const TEACHERS_SMS = "2026/upenthimisi_eggrafis_kathigites.sms.txt";
const GOOGLE_REVIEW_SMS = "2026/google_review.sms.txt";

/** Per-recipient values as the queries really produce them, for each compiled body. */
const REALISTIC_DATA: Record<string, Record<string, string>> = {
	[RENEWAL_SMS]: { first_name: "Μαρία", regid: REGID, token: "tok123", am: "1234", last_name: "Παπαδοπούλου" },
	[GOOGLE_REVIEW_SMS]: { first_name: "Μαρία", token: "tok123" },
	[TEACHERS_SMS]: { greeting: "Αγαπητέ συνάδελφε,", token: "" },
};

type SmsCampaign = CampaignConfig & { sms: SmsCampaignConfig };

/** Every campaign in the registry that ships SMS copy. */
function smsCampaigns(): SmsCampaign[] {
	return Object.values(campaigns).filter((cfg): cfg is SmsCampaign => cfg.sms !== undefined);
}

/**
 * Mirrors the unexported `smsPhone` helper in src/campaign/queries.ts: the
 * mobile is taken from `cellphone` first and `telephone` second, and only a
 * mobile is kept. It is reproduced here from the REAL normaliser and
 * classifier so the rows fed to `collectRecipients` are exactly what the
 * queries would hand a production run.
 */
function pickMobile(cellphone: unknown, telephone: unknown): string | undefined {
	for (const raw of [cellphone, telephone]) {
		const e164 = normalizeGreekPhone(typeof raw === "string" ? raw : null);
		if (e164 && isGreekMobile(e164)) return e164;
	}
	return undefined;
}

/** Runs `fn` with `console.warn` captured, so the runner's skip lines can be asserted without noise. */
async function captureWarnings<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (...args: unknown[]) => { warnings.push(args.map((a) => String(a)).join(" ")); };
	try {
		return { result: await fn(), warnings };
	} finally {
		console.warn = original;
	}
}

describe("Greek phone funnel: normalisation, mobile detection, masking", () => {
	test("normalises, classifies and masks every shape the D1 columns actually hold", () => {
		// One row per real-world shape: the register mixes `69…` mobiles with `2…`
		// landlines, prefixes are hand-typed three different ways, separators are
		// whatever was on the keyboard, and `telephone` defaults to the literal "-".
		const cases: Array<{ label: string; raw: unknown; normalized: string | null; mobile: boolean }> = [
			// --- the shapes that must survive ---
			{ label: "national mobile, as the register stores it", raw: "6983380631", normalized: "+306983380631", mobile: true },
			{ label: "the school's own number, typed with spaces", raw: `+30 698 338 0631`, normalized: "+306983380631", mobile: true },
			{ label: "a +30-prefixed mobile", raw: "+306912345678", normalized: "+306912345678", mobile: true },
			{ label: "the 0030 international prefix", raw: "00306983380631", normalized: "+306983380631", mobile: true },
			{ label: "the bare 30 prefix, only when it adds up to 12 digits", raw: "306983380631", normalized: "+306983380631", mobile: true },
			{ label: "hyphens", raw: "698-338-0631", normalized: "+306983380631", mobile: true },
			{ label: "spaces", raw: "698 338 06 31", normalized: "+306983380631", mobile: true },
			{ label: "non-breaking spaces (copied out of a spreadsheet)", raw: `698${NBSP}338${NBSP}0631`, normalized: "+306983380631", mobile: true },
			{ label: "dots, parentheses and slashes", raw: "(210) 285-00.60", normalized: "+302102850060", mobile: false },
			{ label: "a trailing extension is ignored", raw: "6912345678 εσ. 12", normalized: "+306912345678", mobile: true },
			// --- landlines normalise, but are NOT textable ---
			{ label: "landline, national form", raw: "2102850060", normalized: "+302102850060", mobile: false },
			{ label: "landline, +30 form", raw: "+302102850060", normalized: "+302102850060", mobile: false },
			// --- missing markers and non-strings ---
			{ label: "the telephone column's \"-\" placeholder", raw: "-", normalized: null, mobile: false },
			{ label: "an empty cell", raw: "", normalized: null, mobile: false },
			{ label: "a whitespace-only cell", raw: "   ", normalized: null, mobile: false },
			{ label: "NULL", raw: null, normalized: null, mobile: false },
			{ label: "undefined", raw: undefined, normalized: null, mobile: false },
			{ label: "the string \"n/a\"", raw: "N/A", normalized: null, mobile: false },
			{ label: "\"καμία\"", raw: "καμία", normalized: null, mobile: false },
			{ label: "a number where a string was declared (driver surprise)", raw: 6983380631, normalized: null, mobile: false },
			{ label: "an object where a string was declared", raw: {}, normalized: null, mobile: false },
			// --- typos and junk: rejected, never repaired ---
			{ label: "9-digit typo", raw: "698338063", normalized: null, mobile: false },
			{ label: "11-digit typo", raw: "69833806311", normalized: null, mobile: false },
			{ label: "a German number behind a leading + (never re-prefixed)", raw: "+4915112345678", normalized: null, mobile: false },
			{ label: "a US number", raw: "+14155550100", normalized: null, mobile: false },
			{ label: "a bare foreign national number", raw: "4155550100", normalized: null, mobile: false },
			{ label: "an all-zeros mobile (hand-entered filler)", raw: "6900000000", normalized: null, mobile: false },
			{ label: "the same filler already in E.164", raw: "+306900000000", normalized: null, mobile: false },
			{ label: "letters in front of a valid number", raw: "abc6983380631", normalized: null, mobile: false },
			{ label: "letters only", raw: "τηλέφωνο", normalized: null, mobile: false },
			{ label: "a lone +", raw: "+", normalized: null, mobile: false },
			{ label: "\"0000000000\"", raw: "0000000000", normalized: null, mobile: false },
		];

		for (const c of cases) {
			const normalized = normalizeGreekPhone(c.raw as string | null | undefined);
			expect(normalized, c.label).toBe(c.normalized);
			if (c.normalized !== null) expect(normalized, c.label).toMatch(E164);

			// Classification is derived from normalisation, so a value too dirty to
			// send can never be classified as a mobile — whether it arrives raw or
			// already normalised.
			expect(isGreekMobile(c.raw as string), `${c.label} (raw)`).toBe(c.mobile);
			expect(isGreekMobile(normalized as string), `${c.label} (normalised)`).toBe(c.mobile);

			// The mask is the only form allowed into a log line, so it must never be
			// the input and never carry more than the country code plus the five
			// surviving national digits.
			const mask = maskPhone(c.raw as string);
			const trimmed = typeof c.raw === "string" ? c.raw.trim() : "";
			if (trimmed === "") {
				expect(mask, `${c.label} (empty renders as empty)`).toBe("");
			} else {
				expect(mask, `${c.label} (mask must not echo its input)`).not.toBe(c.raw);
			}
			expect((mask.match(/\d/g) ?? []).length, `${c.label} → ${mask}`).toBeLessThanOrEqual(7);

			if (c.normalized !== null) {
				const national = c.normalized.slice(3);
				expect(mask, c.label).toStartWith("+30");
				expect(mask, c.label).toContain("*****");
				expect(mask, c.label).toContain(national.slice(0, 2));
				expect(mask, c.label).toContain(national.slice(-3));
				// The five hidden digits never survive as a run.
				expect(mask.replace(/^\+30/, ""), c.label).not.toContain(national.slice(2, 7));
				// And a raw cell masks exactly like the E.164 form it normalises to.
				expect(maskPhone(c.normalized), `${c.label} (E.164 masks identically)`).toBe(mask);
			}
		}

		// The contract that lets one dirty batch run to completion: neither
		// function may ever throw, whatever a cell contains.
		for (const hostile of ["", "-", "+", "0030", "30", "0000000000", "א", "📞", "<script>", "  +30  "]) {
			expect(() => normalizeGreekPhone(hostile), hostile).not.toThrow();
			expect(() => maskPhone(hostile), hostile).not.toThrow();
		}
	});
});

describe("collectRecipients", () => {
	test("email channel: case-insensitive dedupe, the blocklist, and a limit", async () => {
		// Nine rows, deliberately ordered so the limit lands before the second
		// no-address row: that is what pins the (surprising) limit semantics.
		const addresses = [
			"Maria@Example.GR", // survivor 1
			"maria@example.gr", // duplicate: only the case differs
			"optout@example.gr", // on the email blocklist
			"", // no address at all
			"Nikos@Example.gr", // survivor 2
			"nikos@example.GR", // duplicate
			"anna@example.gr", // survivor 3 — reaches the limit
			"petros@example.gr", // never inspected under the limit
			"", // never inspected under the limit
		];
		const rows = addresses.map((address) => makeRecipient(address));
		const cfg = makeCampaign({ id: "email-dedupe", getRecipients: async () => rows });

		const { result: limited, warnings } = await captureWarnings(() => collectRecipients(cfg, "sqlite-dev", "email", 3));

		// The limit counts SURVIVORS, stops the scan at the moment it is reached,
		// and the original row (casing included) is what is kept — not the
		// lowercased key.
		expect(limited.recipients.map((r) => r.email)).toEqual(["Maria@Example.GR", "Nikos@Example.gr", "anna@example.gr"]);
		expect(limited.recipients[0]).toBe(rows[0]);
		expect(limited.recipients).toHaveLength(3);
		// Only the no-address row the scan actually reached is counted.
		expect(limited.skippedNoAddress).toBe(1);
		// The blocklisted address is gone, and the duplicate lines name the
		// lowercased key the dedupe uses.
		expect(limited.recipients.map((r) => r.email)).not.toContain("optout@example.gr");
		expect(warnings.join("\n")).toContain("maria@example.gr");
		expect(warnings.join("\n")).toContain("nikos@example.GR");
		expect(warnings.join("\n")).toContain("2 duplicate email(s) skipped");

		// The same list without a limit: the scan reaches every row, so the last
		// survivor and the last no-address row both show up.
		const { result: all, warnings: allWarnings } = await captureWarnings(() => collectRecipients(cfg, "sqlite-dev", "email"));
		expect(allWarnings.join("\n")).toContain("2 duplicate email(s) skipped");
		expect(all.recipients.map((r) => r.email)).toEqual([
			"Maria@Example.GR",
			"Nikos@Example.gr",
			"anna@example.gr",
			"petros@example.gr",
		]);
		expect(all.skippedNoAddress).toBe(2);

		// Proof the blocklist entry is what removed that row rather than some
		// other filter: alone in its own audience, it yields nothing at all.
		const onlyBlocked = makeCampaign({
			id: "email-blocked-only",
			getRecipients: async () => [makeRecipient("optout@example.gr")],
		});
		const blocked = await collectRecipients(onlyBlocked, "sqlite-dev", "email");
		expect(blocked.recipients).toHaveLength(0);
		expect(blocked.skippedNoAddress).toBe(0);

		// Reading recipients is a pure read: no resume state is created for either
		// campaign in the scratch state dir.
		expect(readState(dirs, "email-dedupe")).toBeNull();
		expect(readState(dirs, "email-blocked-only")).toBeNull();
	});

	test("SMS channel: mobiles only, deduped by number, every survivor E.164", async () => {
		requireSmsDryRun();

		// Raw `cellphone`/`telephone` pairs, exactly as D1 holds them, with the
		// phone the shared `smsPhone` helper would derive from each one.
		const raw: Array<{ email: string; cellphone: unknown; telephone: unknown; expected: string | undefined }> = [
			{ email: "maria@example.gr", cellphone: "6983380631", telephone: "-", expected: "+306983380631" },
			// Same mobile, reached through the other column and a +30 prefix:
			// two siblings on one family phone get one message.
			{ email: "adelfi@example.gr", cellphone: "+306983380631", telephone: null, expected: "+306983380631" },
			{ email: "nikos@example.gr", cellphone: "0030 691 234 5678", telephone: null, expected: "+306912345678" },
			// The teachers table has no mobile column, so a mobile living in
			// `telephone` must still be found — and a landline must not be.
			{ email: "kathigitis@example.gr", cellphone: "", telephone: "694 512 3456", expected: "+306945123456" },
			// A Greek landline cannot receive a text: dropped, never dialled.
			{ email: "landline@example.gr", cellphone: null, telephone: "2102850060", expected: undefined },
			{ email: "nophone@example.gr", cellphone: "-", telephone: null, expected: undefined },
			// Hand-entered filler: charging a real SMS to it is the exact mistake
			// the phone module exists to prevent.
			{ email: "filler@example.gr", cellphone: "6900000000", telephone: null, expected: undefined },
		];
		const rows = raw.map((r) => ({ ...makeRecipient(r.email), phone: pickMobile(r.cellphone, r.telephone) }));
		for (const [i, r] of raw.entries()) {
			expect(rows[i].phone, `${r.email} (${String(r.cellphone)} / ${String(r.telephone)})`).toBe(r.expected);
		}

		const cfg = makeCampaign({ id: "sms-dedupe", getRecipients: async () => rows });
		const { result: collected, warnings } = await captureWarnings(() => collectRecipients(cfg, "sqlite-dev", "sms"));

		// The landline, the missing number and the filler are all one number to
		// `skippedNoAddress`: rows this channel cannot reach.
		expect(collected.skippedNoAddress).toBe(3);
		expect(collected.recipients.map((r) => r.email)).toEqual([
			"maria@example.gr",
			"nikos@example.gr",
			"kathigitis@example.gr",
		]);
		// First occurrence wins: the sibling's duplicate row is the one dropped.
		expect(collected.recipients[0]).toBe(rows[0]);
		expect(collected.recipients.map((r) => r.phone)).toEqual([
			"+306983380631",
			"+306912345678",
			"+306945123456",
		]);
		for (const r of collected.recipients) expect(r.phone, r.email).toMatch(E164);

		// The duplicate line identifies the number only in masked form: the raw
		// mobile of a pupil never reaches a log.
		expect(warnings.join("\n")).toContain("+3069*****631");
		expect(warnings.join("\n")).not.toContain("+306983380631");
	});
});

describe("SMS segmentation arithmetic", () => {
	test("detectEncoding, countCharacters and estimateSegments agree on every boundary", async () => {
		requireSmsDryRun();

		// `characters` is what Bird bills (GSM-7 extension chars count 2, emoji
		// count their UTF-16 units); `segments` follows the real capacities:
		// 160/70 for the first segment, 153/67 for each part after it.
		const cases: Array<{ label: string; text: string; encoding: SmsEncoding; characters: number; segments: number }> = [
			{ label: "empty body — nothing to send, so nothing to bill", text: "", encoding: "GSM_7BIT", characters: 0, segments: 0 },
			{ label: "GSM-7: 160 characters is exactly one segment", text: "a".repeat(160), encoding: "GSM_7BIT", characters: 160, segments: 1 },
			{ label: "GSM-7: the 161st character opens a second segment", text: "a".repeat(161), encoding: "GSM_7BIT", characters: 161, segments: 2 },
			{ label: "GSM-7: 153 still fits one segment", text: "a".repeat(153), encoding: "GSM_7BIT", characters: 153, segments: 1 },
			{ label: "GSM-7: two full multipart parts (2 × 153)", text: "a".repeat(306), encoding: "GSM_7BIT", characters: 306, segments: 2 },
			{ label: "GSM-7: 307 needs a third segment", text: "a".repeat(307), encoding: "GSM_7BIT", characters: 307, segments: 3 },
			{ label: "UCS-2: 70 Greek characters is exactly one segment", text: "α".repeat(70), encoding: "UCS_2", characters: 70, segments: 1 },
			{ label: "UCS-2: the 71st Greek character opens a second segment", text: "α".repeat(71), encoding: "UCS_2", characters: 71, segments: 2 },
			{ label: "UCS-2: 67 is the multipart part size", text: "α".repeat(67), encoding: "UCS_2", characters: 67, segments: 1 },
			{ label: "UCS-2: two full multipart parts (2 × 67)", text: "α".repeat(134), encoding: "UCS_2", characters: 134, segments: 2 },
			{ label: "UCS-2: 135 needs a third segment", text: "α".repeat(135), encoding: "UCS_2", characters: 135, segments: 3 },
			{ label: "€ is a GSM-7 extension character: ESC + code, so 2", text: "€", encoding: "GSM_7BIT", characters: 2, segments: 1 },
			{ label: "every extension character costs double (€ { [ } ])", text: "€{[}]", encoding: "GSM_7BIT", characters: 10, segments: 1 },
			{ label: "the ⭐ the review SMS ships (BMP, but not in GSM 03.38)", text: "⭐", encoding: "UCS_2", characters: 1, segments: 1 },
			{ label: "an astral emoji is one code point, two UTF-16 units", text: "😀", encoding: "UCS_2", characters: 2, segments: 1 },
			{ label: "the GSM alphabet's Greek CAPITALS really are 7-bit", text: "Δ", encoding: "GSM_7BIT", characters: 1, segments: 1 },
			{ label: "but real Greek copy is lowercase, so UCS-2", text: "αβγ", encoding: "UCS_2", characters: 3, segments: 1 },
			{ label: "one Greek letter promotes the whole body to UCS-2", text: "abc€α", encoding: "UCS_2", characters: 5, segments: 1 },
			{ label: "a newline is in the GSM basic table", text: "a\nb", encoding: "GSM_7BIT", characters: 3, segments: 1 },
		];

		for (const c of cases) {
			const detected = detectEncoding(c.text);
			const counted = countCharacters(c.text);
			const estimated = estimateSegments(c.text);

			expect(detected, c.label).toBe(c.encoding);
			expect(counted, c.label).toEqual({ encoding: c.encoding, characters: c.characters });
			expect(estimated, c.label).toEqual({ count: c.segments, encoding: c.encoding, characters: c.characters });
		}

		// The real campaign copy is Greek, so it is UCS-2 on every body — the
		// single fact that makes a segment 67 characters instead of 160 and the
		// 3-segment budgets in src/campaign/campaigns.ts a cost ceiling.
		const bodies = await Promise.all(
			smsCampaigns().map(async (cfg) => ({
				id: cfg.id,
				template: cfg.sms.templateName,
				body: await renderSmsText({ smsTemplateName: cfg.sms.templateName, templateData: REALISTIC_DATA[cfg.sms.templateName] }),
			})),
		);
		expect(bodies.length).toBeGreaterThanOrEqual(3);
		for (const { id, template, body } of bodies) {
			expect(detectEncoding(body), `${id} (${template})`).toBe("UCS_2");
			expect(countCharacters(body).characters, `${id}`).toBeGreaterThan(70);
			// Even the compiled template before substitution is Greek throughout.
			expect(detectEncoding(await Bun.file(`sms_templates/${template}`).text()), `${template} as compiled`).toBe("UCS_2");
		}
	});
});

describe("compiled SMS copy", () => {
	test("every campaign body renders inside budget, and a missing value aborts instead", async () => {
		requireSmsDryRun();

		const guard = blockProviderFetch();
		try {
			// 1. The happy path: every campaign that ships SMS copy renders with
			//    realistic per-recipient data. Rendering reads local build
			//    artefacts only — the fetch guard proves no provider is touched.
			const visited = new Set<string>();
			for (const cfg of smsCampaigns()) {
				const spec = cfg.sms;
				const data = REALISTIC_DATA[spec.templateName];
				expect(data, `${cfg.id} has no realistic data in this test`).toBeDefined();
				const body = await renderSmsText({ smsTemplateName: spec.templateName, templateData: data });
				visited.add(spec.templateName);

				const budget = spec.maxSegments ?? DEFAULT_SMS_MAX_SEGMENTS;
				const { count, encoding, characters } = estimateSegments(body);
				expect(encoding, `${cfg.id} must be UCS-2 (Greek copy)`).toBe("UCS_2");
				expect(count, `${cfg.id}/${spec.templateName}: ${characters} chars, budget ${budget}`).toBeLessThanOrEqual(budget);
				expect(count, `${cfg.id}: an empty body is not a send`).toBeGreaterThan(0);
				// Nothing left unsubstituted, and an SMS is one line by definition:
				// a newline would render as a gap and still be billed.
				expect(body, `${cfg.id} has an unfilled placeholder`).not.toMatch(/\{\{|\}\}/);
				expect(body, `${cfg.id} must be a single line`).not.toContain("\n");
				expect(body, `${cfg.id} must be trimmed`).toBe(body.trim());
			}
			// The registry's SMS copy is exactly the compiled set — every body is
			// covered above, and no compiled body is orphaned.
			expect([...visited].sort()).toEqual([GOOGLE_REVIEW_SMS, RENEWAL_SMS, TEACHERS_SMS].sort());

			// The budget is not vacuous: a worst-case Greek name still fits.
			const longName = await renderSmsText({
				smsTemplateName: RENEWAL_SMS,
				templateData: { first_name: "Χριστοδουλοπούλου", regid: REGID },
			});
			expect(estimateSegments(longName).count).toBeLessThanOrEqual(3);

			expect(guard.calls, "rendering must not call a provider").toEqual([]);

			// 2. The guard: a placeholder with no value is refused before it can
			//    become a gap (or a dead {{regid}} link) that still costs segments.
			const cases: Array<{ label: string; template: string; data: Record<string, string>; error: RegExp | null; matches?: RegExp }> = [
				{ label: "renewal without regid — the link would go nowhere", template: RENEWAL_SMS, data: { first_name: "Μαρία" }, error: /\{\{regid\}\}/ },
				{ label: "renewal without first_name — a gap next to a comma", template: RENEWAL_SMS, data: { regid: REGID }, error: /\{\{first_name\}\}/ },
				{ label: "renewal with a whitespace-only regid", template: RENEWAL_SMS, data: { first_name: "Μαρία", regid: "   " }, error: /\{\{regid\}\}/ },
				{ label: "renewal with both values", template: RENEWAL_SMS, data: { first_name: "Μαρία", regid: REGID }, error: null, matches: /regid=k7Qm2Xr9Tb4Lz1Nc8Vd5Ws3Yh6Pj0Gf2/ },
				{ label: "teacher body without the greeting", template: TEACHERS_SMS, data: {}, error: /\{\{greeting\}\}/ },
				// The teacher template never uses regid, so it renders with none.
				{ label: "teacher body needs no regid at all", template: TEACHERS_SMS, data: { greeting: "Αγαπητή συνάδελφε," }, error: null, matches: /εγγραφές 2026-27/ },
			];
			for (const c of cases) {
				const render = renderSmsText({ smsTemplateName: c.template, templateData: c.data });
				if (c.error) {
					await expect(render, c.label).rejects.toThrow(c.error);
					// The message has to say what happens to the recipient and why,
					// otherwise an operator sees a skip with no explanation.
					await render.catch((e: Error) => {
						expect(e.message, c.label).toContain("no value");
						expect(e.message, c.label).toContain("skipped");
					});
				} else {
					expect(await render, c.label).toMatch(c.matches!);
				}
			}
		} finally {
			guard.restore();
		}
	});
});

describe("SMS sender resolution", () => {
	test("accepts Bird-legal senders, refuses the rest, and explains the ASCII rule", () => {
		requireSmsDryRun();

		const originalFrom = process.env.BIRD_SMS_FROM;
		try {
			delete process.env.BIRD_SMS_FROM;

			// Every row is either an accepted value (returned trimmed) or the
			// pattern its refusal message must carry.
			const cases: Array<[label: string, value: string, expected: string | RegExp]> = [
				["the school's shipped sender ID", "BYZSCHOOL", "BYZSCHOOL"],
				["lower length boundary (3 characters)", "ABC", "ABC"],
				["upper length boundary (11 characters)", "ABCDEFGHIJK", "ABCDEFGHIJK"],
				["letters, digits and an inner dot/hyphen", "BYZ-SCH.26", "BYZ-SCH.26"],
				["digits are fine as long as one letter is present", "1234567A", "1234567A"],
				["an owned E.164 number", "+306983380631", "+306983380631"],
				["surrounding whitespace is trimmed", "  BYZSCHOOL  ", "BYZSCHOOL"],
				["the Greek school name", "Σχολή Βυζαντινής", /Invalid SMS sender/],
				["a single Greek letter", "Σ", /Invalid SMS sender/],
				["2 characters", "AB", /Invalid SMS sender/],
				["12 characters", "ABCDEFGHIJKL", /Invalid SMS sender/],
				["digits only, with no letter", "1234567", /Invalid SMS sender/],
				["a leading separator", "-BYZ", /Invalid SMS sender/],
				["a trailing separator", "BYZ-", /Invalid SMS sender/],
				["a leading dot", ".BYZ", /Invalid SMS sender/],
				["a non-ASCII punctuation mark", "BYZSCHOOL!", /Invalid SMS sender/],
				["an emoji inside the ID", "BYZ⭐", /Invalid SMS sender/],
				["whitespace only", "   ", /No SMS sender configured/],
				["an explicitly empty value", "", /No SMS sender configured/],
			];
			for (const [label, value, expected] of cases) {
				if (typeof expected === "string") {
					expect(resolveSmsFrom(value), label).toBe(expected);
				} else {
					expect(() => resolveSmsFrom(value), label).toThrow(expected);
				}
			}

			// Each refusal has to name the rule it broke, because the operator's
			// only feedback is this string.
			const messageFor = (value: string): string => {
				try {
					resolveSmsFrom(value);
					return "";
				} catch (e) {
					return (e as Error).message;
				}
			};
			expect(messageFor("AB")).toMatch(/3.11 ASCII characters/);
			expect(messageFor("ABCDEFGHIJKL")).toMatch(/3.11 ASCII characters/);
			expect(messageFor("1234567")).toContain("at least one letter");
			expect(messageFor("-BYZ")).toContain("no separator at either end");

			// The Greek name is the likeliest mistake, and Bird's own error would
			// not explain it — so the message must carry the ASCII rule and the
			// workaround.
			const greek = messageFor("Σχολή Βυζαντινής");
			expect(greek).toContain("Invalid SMS sender");
			expect(greek).toContain("Σχολή Βυζαντινής"); // quotes the rejected value back
			expect(greek).toContain("ASCII");
			expect(greek).toContain("Greek characters cannot be used");
			expect(greek).toContain("at least one letter");
			expect(greek).toContain("no separator at either end");
			expect(greek).toContain("BYZSCHOOL"); // the ID that will work

			// With nothing passed in, BIRD_SMS_FROM is the fallback; an explicit
			// value wins over it, and an explicit empty string does not silently
			// fall back to it.
			expect(() => resolveSmsFrom()).toThrow(/No SMS sender configured/);
			expect(() => resolveSmsFrom()).toThrow(/BIRD_SMS_FROM/);
			process.env.BIRD_SMS_FROM = "BYZSCHOOL";
			expect(resolveSmsFrom()).toBe("BYZSCHOOL");
			expect(resolveSmsFrom("OTHERID")).toBe("OTHERID");
			expect(() => resolveSmsFrom("")).toThrow(/No SMS sender configured/);
			// An env value that Bird would refuse is refused just the same.
			process.env.BIRD_SMS_FROM = "Σχολή Βυζαντινής";
			expect(() => resolveSmsFrom()).toThrow(/ASCII/);
		} finally {
			if (originalFrom === undefined) delete process.env.BIRD_SMS_FROM;
			else process.env.BIRD_SMS_FROM = originalFrom;
		}
	});
});

/**
 * Smoke test for the SMS campaign path — no credentials, no network, no sends.
 *
 * Answers the two questions an operator has before a real run:
 *
 *   1. Does each campaign's compiled SMS body still fit its segment budget?
 *      Greek is UCS-2, so a segment holds 67 characters rather than 160, and an
 *      over-budget body is a hard failure at send time (Bird rejects it rather
 *      than truncating) — so it is worth catching here.
 *   2. Does the Bird request shape survive the transport? Every body is pushed
 *      through `smsService` with `BIRD_DRY_RUN` forced on, which exercises
 *      validation, sender resolution, segmentation and request building while
 *      guaranteeing nothing is transmitted.
 *
 * Run after editing SMS copy:
 *   bun run templates:build && bun run sms:check
 */
import path from "node:path";
import { campaigns } from "../src/campaign/campaigns";
import { applyToTemplate } from "../src/mailersend";
import { renderSmsText, resolveSmsFrom, smsService } from "../src/sms";
import { loadEnvFile } from "../src/loadEnvFile";
import { estimateSegments } from "../src/sms/segments";

const envDir = path.resolve(import.meta.dir, "..");
loadEnvFile(path.join(envDir, ".env.development"));

// Hard overrides: this script must never send, whatever the env file says, and
// it must be able to run before the operator has configured a real sender.
process.env.BIRD_DRY_RUN = "true";
process.env.BIRD_SMS_FROM ??= "BYZSCHOOL";

/**
 * A realistic recipient per campaign.
 *
 * `first_name` is deliberately the longest plausible Greek name: it is the
 * placeholder whose length varies most from recipient to recipient, so it is
 * the one that decides whether a body fits the budget for everyone or only for
 * "Άννα". `regid` is a real 32-character token, which is what the registration
 * URL actually carries and therefore what the budget really has to absorb.
 */
const SAMPLE_RECIPIENT: Record<string, string> = {
	first_name: "Χριστοδουλοπούλου",
	last_name: "Παπαδοπούλου",
	am: "1234",
	regid: "eezDMbOkR4CvrOrLL0lhiSuxnN1j17Xf",
	token: "krS49OBHJ1YjidwH",
};

const SAMPLE_DATA: Record<string, Record<string, string>> = {
	"renew-2026": { ...SAMPLE_RECIPIENT },
	// Same query and same copy as renew-2026, so the same recipient applies.
	"renew-2026-fix": { ...SAMPLE_RECIPIENT },
	"google-review-2026": { first_name: SAMPLE_RECIPIENT.first_name, token: SAMPLE_RECIPIENT.token },
	"teachers-eggrafes-2026": { greeting: "Αγαπητέ συνάδελφε,", token: "" },
};

/** The number a test SMS would go to; never dialled here because dry-run is forced. */
const SAMPLE_TO = "+306912345678";

const failures: string[] = [];

function check(label: string, ok: boolean, detail: string) {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures.push(label);
}

console.log("SMS campaign smoke test (dry run — nothing is sent)\n");

for (const [id, cfg] of Object.entries(campaigns)) {
	if (!cfg.sms) {
		console.log(`${id}: no sms block — email only (--sms would refuse this campaign).`);
		continue;
	}

	const budget = cfg.sms.maxSegments ?? 3;
	const sample = SAMPLE_DATA[id];
	if (!sample) {
		// Better a loud gap than a rendered body full of empty placeholders that
		// looks like it passed.
		console.warn(`  WARNING: no sample recipient for "${id}" — the body below is NOT representative.`);
	}
	const templateData = sample ?? { token: "" };
	const text = await renderSmsText({ smsTemplateName: cfg.sms.templateName, templateData });
	const segments = estimateSegments(text);

	console.log(`\n${id}  [${cfg.sms.category}]  ${cfg.sms.templateName}`);
	console.log(`  ${text}`);
	check(
		`fits the ${budget}-segment budget`,
		segments.count <= budget,
		`${segments.count} segment(s), ${segments.characters} ${segments.encoding} chars`,
	);

	// The whole send path, minus the network.
	const result = await smsService({
		to: SAMPLE_TO,
		from: cfg.sms.from,
		category: cfg.sms.category,
		text,
		maxSegments: budget,
		tags: [{ name: "campaign", value: id }],
		metadata: { campaign: id, test: true },
	});
	check("transport accepted the request in dry-run", result.dryRun && result.accepted, `id=${result.id}`);
}

// The inline --sms-message escape hatch goes through the same substitution.
const inline = applyToTemplate("{{greeting}} πρόχειρη ειδοποίηση", { greeting: "Αγαπητέ συνάδελφε," });
console.log("\n--sms-message substitution");
check("substitutes placeholders", inline === "Αγαπητέ συνάδελφε, πρόχειρη ειδοποίηση", inline);

// A recipient who cannot fill a placeholder must be refused, not sent a hole:
// for {{regid}} that hole is a dead link that still bills two segments.
console.log("\nIncomplete personalization");
let guarded = false;
try {
	await renderSmsText({
		smsTemplateName: "2026/upenthimisi_eggrafis.sms.txt",
		templateData: { first_name: "Μαρία" }, // deliberately no regid
	});
} catch {
	guarded = true;
}
check("refuses a recipient missing {{regid}}", guarded, "a dead link would still cost 2 segments");

// The sender guard is the thing that explains why the school's Greek name cannot
// be the Bird sender ID — assert it still refuses, with a usable hint.
console.log("\nSender validation");
const greekName = "Σχολή Βυζαντινής & Παραδοσιακής Μουσικής";
let rejected = false;
try {
	resolveSmsFrom(greekName);
} catch {
	rejected = true;
}
check("rejects the Greek school name as a sender ID", rejected, "use an ASCII ID such as BYZSCHOOL");
check("accepts an ASCII alphanumeric sender", resolveSmsFrom("BYZSCHOOL") === "BYZSCHOOL", "BYZSCHOOL");
check("accepts an owned E.164 number", resolveSmsFrom("+306912345678") === "+306912345678", "+306912345678");

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed.`);
	process.exit(1);
}
console.log("\nAll checks passed.");

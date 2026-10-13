import path from "node:path";
import { campaigns } from "./campaign/campaigns";
import { collectRecipients, resolveSmsSource, runCampaign } from "./campaign/runner";
import { collectStats } from "./campaign/stats";
import { renderStatsReport } from "./campaign/statsReport";
import type { CampaignChannel, CampaignSummary, DBKind } from "./campaign/types";
import { loadEnvFile } from "./loadEnvFile";
import type { SmsCategory } from "./sms/bird";
import { getSmsStatsByTag } from "./sms/delivery";
import { isGreekMobile, maskPhone, normalizeGreekPhone } from "./sms/phone";

const envDir = path.resolve(import.meta.dir, "..");


const SMS_CATEGORIES: SmsCategory[] = ["marketing", "transactional", "authentication", "service"];

function usage() {
	console.log(`
Usage: bun run campaign <campaignId> [options]

Channel:
  --sms            Send SMS instead of email (shorthand for --channel sms)
  --channel <c>    email | sms | both (default: email)

Options:
  --send           Actually send (default is a dry run)
  --db <prod|dev>  Database to read recipients from (default: dev for dry runs, prod for sends)
  --limit <n>      Cap the number of recipients
  --pace <ms>      Milliseconds between sends (overrides the campaign default, 800ms)
  --preview <n>    Dry run: write n sample messages to out/ (default 1)
  --testmail       Also send one test email of the first recipient's data to you
                   (default: your address from TEST_MAIL_TO, falls back to koxafis@gmail.com;
                   use "--testmail <email>" to override)
  --testsms        Also send one test SMS of the first recipient's data to you
                   (default: your number from TEST_SMS_TO in .env;
                   use "--testsms <number>" to override)
  --no-attachment  Skip the poster attachment (keeps the inline image only)
  --yes            Skip the interactive confirmation before sending
  --quiet          Do not print one line per recipient
  --list           List available campaigns

Stats:
  --stats          Report what has already been sent, instead of sending.
                   Works for one campaign (with an id) or every campaign (without).
                   Read from campaign-state/ — no network, no credentials.
  --days <n>       Window for the daily breakdown, today included (default 14)
  --live           Also count the current audience from D1 and show progress.
                   Costs one query (~15s) per channel, so it is opt-in.
  --delivery       Also ask Bird for carrier-confirmed SMS delivery, failure rates
                   and latency percentiles (needs BIRD_API_KEY).
  --json           Print the report as JSON instead of a table
  --db <prod|dev>  Database for --live (default: prod)

SMS options:
  --sms-message <text>   Send this ad-hoc body instead of the campaign's compiled
                         SMS template. {{placeholders}} are substituted per recipient.
  --sms-category <c>     Bird category for an ad-hoc body:
                         ${SMS_CATEGORIES.join(" | ")}
                         (a campaign's own SMS template supplies its category)
  --sms-segments <n>     Segment budget per message (default: the campaign's, else 3).
                         Greek text is UCS-2, so a segment holds only 67 characters.

SMS bodies are compiled from the React Email components in render/sms/ by
\`bun run templates:build\`; run that first after editing SMS copy.

Examples:
  bun run campaign renew-2026                       # email dry run against the preview D1
  bun run campaign renew-2026 --sms --testsms       # SMS dry run + one test SMS to yourself
  bun run campaign renew-2026 --sms --send --db prod --yes
  bun run campaign renew-2026 --channel both --send --db prod --yes
  bun run campaign teachers-eggrafes-2026 --sms --sms-message "{{greeting}} πρόχειρη ειδοποίηση"

  bun run campaign --stats                          # how every campaign has done so far
  bun run campaign renew-2026 --stats --live        # one campaign, with remaining recipients
  bun run campaign renew-2026 --stats --delivery    # + Bird's carrier delivery numbers
  bun run campaign --stats --json > stats.json
`);
}

function listCampaigns() {
	console.log("Available campaigns:");
	// The column follows the longest id rather than a fixed width: a fixed padEnd
	// silently misaligned the channel bracket the moment a campaign id grew past
	// it (agiasmos-aponomi-kathigites-2026 is 31 characters).
	const width = Math.max(...Object.keys(campaigns).map((id) => id.length));
	for (const [id, cfg] of Object.entries(campaigns)) {
		const channels = cfg.sms ? "email, sms" : "email";
		console.log(`  ${id.padEnd(width)}  [${channels}]  ${cfg.title}`);
	}
}

type ParsedArgs = {
	id: string | null;
	send: boolean;
	db: DBKind | null;
	limit?: number;
	preview: number;
	pace?: number;
	testMail: boolean;
	testEmail?: string;
	testSms: boolean;
	testPhone?: string;
	yes: boolean;
	quiet: boolean;
	attachment: boolean;
	channel: CampaignChannel | "both" | null;
	smsMessage?: string;
	smsCategory?: SmsCategory;
	smsSegments?: number;
	stats: boolean;
	live: boolean;
	delivery: boolean;
	json: boolean;
	days?: number;
	list: boolean;
	help: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		id: null,
		send: false,
		db: null,
		limit: undefined,
		preview: 1,
		pace: undefined,
		testMail: false,
		testEmail: undefined,
		testSms: false,
		testPhone: undefined,
		yes: false,
		quiet: false,
		attachment: true,
		channel: null,
		smsMessage: undefined,
		smsCategory: undefined,
		smsSegments: undefined,
		stats: false,
		live: false,
		delivery: false,
		json: false,
		days: undefined,
		list: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "--send": parsed.send = true; break;
			case "--yes": parsed.yes = true; break;
			case "--quiet": parsed.quiet = true; break;
			case "--no-attachment": parsed.attachment = false; break;
			case "--list": parsed.list = true; break;
			case "--stats": parsed.stats = true; break;
			case "--live": parsed.live = true; break;
			case "--delivery": parsed.delivery = true; break;
			case "--json": parsed.json = true; break;
			case "--days": {
				const v = Number(argv[++i]);
				if (!Number.isInteger(v) || v < 1 || v > 365) throw new Error("--days must be a whole number between 1 and 365");
				parsed.days = v;
				break;
			}
			case "--help": case "-h": parsed.help = true; break;
			case "--sms": parsed.channel = "sms"; break;
			case "--testmail": {
				parsed.testMail = true;
				const next = argv[i + 1];
				if (next && !next.startsWith("-")) {
					parsed.testEmail = next;
					i++;
				}
				break;
			}
			case "--testsms": {
				parsed.testSms = true;
				const next = argv[i + 1];
				if (next && !next.startsWith("-")) {
					parsed.testPhone = next;
					i++;
				}
				break;
			}
			case "--channel": {
				const v = argv[++i];
				if (v !== "email" && v !== "sms" && v !== "both") throw new Error("--channel must be email, sms or both");
				parsed.channel = v;
				break;
			}
			case "--sms-message": {
				const v = argv[++i];
				// Reject a missing value AND a following flag: without the second check
				// `--sms-message --send` quietly takes "--send" as the message body and
				// the run never sends anything.
				if (!v || v.startsWith("-")) throw new Error("--sms-message needs a body");
				if (!v.trim()) throw new Error("--sms-message needs a non-empty body");
				parsed.smsMessage = v;
				break;
			}
			case "--sms-category": {
				const v = argv[++i] as SmsCategory;
				if (!SMS_CATEGORIES.includes(v)) throw new Error(`--sms-category must be one of: ${SMS_CATEGORIES.join(", ")}`);
				parsed.smsCategory = v;
				break;
			}
			case "--sms-segments": {
				const v = Number(argv[++i]);
				if (!Number.isInteger(v) || v < 1 || v > 12) throw new Error("--sms-segments must be an integer between 1 and 12");
				parsed.smsSegments = v;
				break;
			}
			case "--db": {
				const v = argv[++i];
				if (v !== "prod" && v !== "dev") throw new Error("--db must be prod or dev");
				parsed.db = v === "prod" ? "sqlite-prod" : "sqlite-dev";
				break;
			}
			case "--limit": {
				// Validated, not just coerced: `Number("abc")` is NaN, and the runner's
				// cap check compares against it in a way that silently means "no limit"
				// — which on an SMS run means "bill every recipient".
				const v = Number(argv[++i]);
				if (!Number.isInteger(v) || v < 1) throw new Error("--limit must be a positive whole number");
				parsed.limit = v;
				break;
			}
			case "--preview": {
				const v = Number(argv[++i]);
				if (!Number.isInteger(v) || v < 0) throw new Error("--preview must be a whole number (0 or more)");
				parsed.preview = v;
				break;
			}
			case "--pace": {
				const v = Number(argv[++i]);
				if (!(v > 0)) throw new Error("--pace must be a positive number (milliseconds between sends)");
				parsed.pace = v;
				break;
			}
			default:
				if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
				if (parsed.id) throw new Error(`Unexpected argument: ${arg}`);
				parsed.id = arg;
		}
	}
	return parsed;
}

function summarizeRecipients(recipients: { email: string; phone?: string; templateData: Record<string, string> }[], channel: CampaignChannel, limit = 20) {
	for (const [i, r] of recipients.entries()) {
		if (i >= limit) {
			console.log(`  … and ${recipients.length - limit} more`);
			break;
		}
		const t = r.templateData;
		// Phone numbers are masked even locally: this prints to a terminal and is
		// the kind of output that ends up pasted into a chat or an issue.
		const address = channel === "sms" ? `${maskPhone(r.phone ?? "")}  (${r.email})` : r.email;
		console.log(`  ${address}  —  ${t.first_name ?? ""} ${t.last_name ?? ""} (ΑΜ ${t.am ?? "?"})`);
	}
}

/** Resolves the channel(s) this run targets. `--sms` wins over a bare default. */
function resolveChannels(args: ParsedArgs): CampaignChannel[] {
	if (args.channel === "both") return ["email", "sms"];
	if (args.channel === "sms") return ["sms"];
	if (args.channel === "email") return ["email"];
	return ["email"];
}

function reportSummary(channel: CampaignChannel, summary: CampaignSummary, sending: boolean) {
	const label = channel === "sms" ? "SMS" : "email";
	if (!sending) {
		console.log(`\nDry run complete (${label}). ${summary.previewFiles.length} preview file(s) written:`);
		for (const f of summary.previewFiles) console.log(`  ${f}`);
	} else {
		console.log(
			`\nSend complete (${label}): ${summary.sentNow} sent, ${summary.failed} failed, ${summary.alreadySent} skipped (already sent previously).`,
		);
		if (summary.pausedAtDailyCap) console.log("Paused at the daily cap — re-run later to resume.");
	}
	if (summary.skippedNoAddress > 0) {
		console.log(
			`${summary.skippedNoAddress} recipient(s) skipped — no usable ${channel === "sms" ? "mobile number" : "email address"} on file.`,
		);
	}
}

/**
 * `--stats`: report what each campaign has actually sent.
 *
 * The base numbers come from the local state files, so this works offline and
 * cannot fail because a provider is down. Both enrichments are opt-in because
 * each costs something real: `--live` pays a D1 query per channel, and
 * `--delivery` calls Bird and needs an API key.
 */
async function runStats(args: ParsedArgs): Promise<void> {
	const windowDays = args.days ?? 14;
	const report = await collectStats({ campaignId: args.id ?? undefined, windowDays });

	if (args.id && report.campaigns.length === 0) {
		console.error(
			`No recorded activity for campaign "${args.id}" — it has never been sent from this machine, or its state file was removed.`,
		);
		process.exit(1);
	}

	if (args.live || args.delivery) {
		// These read the live world, so they default to production: a report about
		// what was sent should describe reality, not a preview database.
		const db: DBKind = args.db ?? "sqlite-prod";
		loadEnvFile(path.join(envDir, db === "sqlite-prod" ? ".env.production" : ".env.development"), { override: true });

		if (args.live) {
			// stderr, so `--stats --live --json` still emits clean JSON on stdout.
			console.error("Counting the current audience (one D1 query per channel — this takes a moment)…");
			for (const campaign of report.campaigns) {
				const cfg = campaigns[campaign.campaignId];
				// A campaign whose definition was removed can no longer be queried; its
				// historical numbers still stand, so skip rather than fail.
				if (!cfg) continue;
				const email = await collectRecipients(cfg, db, "email");
				const sms = await collectRecipients(cfg, db, "sms");
				campaign.audience = {
					email: email.recipients.length,
					sms: sms.recipients.length,
					smsSkipped: sms.skippedNoAddress,
				};
			}
		}

		if (args.delivery) {
			for (const campaign of report.campaigns) {
				// Query when the campaign is CONFIGURED for SMS, not only when it has
				// already sent some: a campaign that has never sent an SMS should
				// report "Bird has no records yet", which is informative, rather than
				// silently omitting the section.
				const wantsSms =
					campaign.configuredChannels.includes("sms") || campaign.channels.some((c) => c.channel === "sms");
				if (!wantsSms) continue;
				try {
					campaign.delivery = await getSmsStatsByTag(`campaign:${campaign.campaignId}`, { days: args.days ?? 30 });
				} catch (e) {
					// A delivery lookup must never sink the report: the local numbers are
					// still valid, and they are why the operator ran the command.
					campaign.deliveryError = e instanceof Error ? e.message : String(e);
				}
			}
		}
	}

	if (args.json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}
	console.log(renderStatsReport(report, { single: Boolean(args.id) }));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) return usage();
	if (args.list) return listCampaigns();

	if (args.stats) {
		// --stats reports; it never sends, and accepting both would imply otherwise.
		if (args.send) {
			console.error("\n--stats only reports. Drop --send, or drop --stats to actually send.");
			process.exit(1);
		}
		return runStats(args);
	}

	if (args.live || args.delivery || args.json || args.days !== undefined) {
		console.error("\n--live, --delivery, --json and --days only apply to --stats.");
		process.exit(1);
	}

	if (!args.id) {
		usage();
		listCampaigns();
		process.exit(1);
	}

	const cfg = campaigns[args.id];
	if (!cfg) {
		console.error(`Unknown campaign "${args.id}".`);
		listCampaigns();
		process.exit(1);
	}

	const db: DBKind = args.db ?? (args.send ? "sqlite-prod" : "sqlite-dev");
	// The database was chosen explicitly (--db, or --send implying prod), so its
	// env file must win over the `.env.development` Bun auto-loaded before this
	// script started — otherwise `--db prod` silently runs on dev values.
	// See src/loadEnvFile.ts.
	if (db === "sqlite-prod") loadEnvFile(path.join(envDir, ".env.production"), { override: true });
	else loadEnvFile(path.join(envDir, ".env.development"), { override: true });

	const channels = resolveChannels(args);

	// Fail fast on missing SMS copy — the D1 query below takes ~15s, and there is
	// no point paying for it to reach an error we can see right now.
	if (channels.includes("sms")) resolveSmsSource(cfg, args.smsMessage);

	if (args.testSms && !channels.includes("sms")) {
		console.error('\n--testsms needs the SMS channel. Add --sms (or --channel both).');
		process.exit(1);
	}

	// A test SMS must be a real E.164 number before it reaches Bird. There is no
	// built-in fallback: the operator's number lives in the gitignored .env.
	let testSmsTo: string | undefined;
	if (args.testSms) {
		const raw = args.testPhone || process.env.TEST_SMS_TO || "";
		if (!raw) {
			console.error(`\n--testsms: no number given. Pass "--testsms <number>" or set TEST_SMS_TO in .env.`);
			process.exit(1);
		}
		const normalized = normalizeGreekPhone(raw);
		// A mobile, not merely a valid Greek number: the recipient path drops
		// landlines because they cannot receive a text, and a test SMS to one would
		// fail in exactly the same way while still being billed.
		if (!normalized || !isGreekMobile(normalized)) {
			console.error(`\n--testsms: "${raw}" is not a usable Greek mobile number (landlines cannot receive SMS).`);
			process.exit(1);
		}
		testSmsTo = normalized;
	}

	console.log(`\nCampaign: ${cfg.title}`);
	console.log(`Subject: ${cfg.subject}`);
	console.log(`Channels: ${channels.join(" + ")}`);
	console.log(`Recipients: from ${db === "sqlite-prod" ? "PRODUCTION DB (byzantini-db)" : "preview DB (byzantini-db-preview)"}`);

	if (args.send && db === "sqlite-dev") {
		console.error("\nSafety: refusing to send with the dev database. Use --db prod with --send.");
		process.exit(1);
	}

	// Collect per channel: each has its own blocklist and dedupe key, and an SMS
	// run drops anyone without a mobile number.
	const collectedByChannel = new Map<CampaignChannel, Awaited<ReturnType<typeof collectRecipients>>>();
	for (const channel of channels) {
		collectedByChannel.set(channel, await collectRecipients(cfg, db, channel, args.limit));
	}

	for (const channel of channels) {
		const collected = collectedByChannel.get(channel)!;
		console.log(
			`\n${channel === "sms" ? "SMS" : "Email"} recipients: ${collected.recipients.length}` +
				(collected.skippedNoAddress > 0 ? ` (${collected.skippedNoAddress} skipped — no usable number)` : ""),
		);
		if (!args.send) {
			console.log("Recipients (first 20):");
			summarizeRecipients(collected.recipients, channel);
		}
	}

	if (args.send) {
		const totalToSend = channels.reduce((n, c) => n + collectedByChannel.get(c)!.recipients.length, 0);
		if (!args.yes) {
			const what = channels.includes("sms") && channels.includes("email") ? "emails and SMS" : channels.includes("sms") ? "real SMS messages" : "real emails";
			const answer = prompt(`\nSend ${totalToSend} ${what} to real people? Type "yes" to confirm: `);
			if (answer?.trim().toLowerCase() !== "yes") {
				console.log("Aborted.");
				process.exit(1);
			}
		}
	}

	let failed = false;
	for (const channel of channels) {
		const summary = await runCampaign(cfg, collectedByChannel.get(channel)!, {
			db,
			mode: args.send ? "send" : "dry",
			channel,
			previewCount: args.preview,
			testMailTo: args.testMail ? args.testEmail || process.env.TEST_MAIL_TO || "koxafis@gmail.com" : undefined,
			testSmsTo: channel === "sms" ? testSmsTo : undefined,
			smsMessage: args.smsMessage,
			smsCategory: args.smsCategory,
			smsMaxSegments: args.smsSegments,
			attachment: args.attachment,
			paceMs: args.pace,
			quiet: args.quiet,
		});
		reportSummary(channel, summary, args.send);
		if (summary.failed > 0) failed = true;
	}

	if (!args.send) {
		console.log("\nOpen a preview, then re-run with --send --db prod to send for real.");
	}
	if (failed) process.exitCode = 1;
}

main().catch((e) => {
	// Argument and configuration mistakes are the common case here, and a full
	// stack trace buries the single line that says what to fix. Set DEBUG=1 when
	// the failure is a genuine bug and the trace is the useful part.
	console.error(e instanceof Error ? (process.env.DEBUG ? e.stack : e.message) : e);
	process.exit(1);
});

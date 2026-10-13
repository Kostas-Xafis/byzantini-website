import { readFileSync } from "node:fs";
import path from "node:path";
import { createDbConnection } from "../src/db";
import { loadEnvFile } from "../src/loadEnvFile";
import type { DBKind } from "../src/campaign/types";

/**
 * Removes suppressed recipients (hard bounces / spam complaints) from the
 * emailing list. Feed it the MailerSend suppression CSVs:
 *
 *   bun run remove-suppressed suppressed_hard_bounces.csv suppressed_spam_complaints.csv   # dry-run (preview D1)
 *   bun run remove-suppressed <csv...> --db prod                                           # dry-run vs prod
 *   bun run remove-suppressed <csv...> --db prod --yes                                     # delete for real
 *
 * It deletes matching rows from email_subscriptions only — historical
 * registrations are left untouched.
 */

/** Minimal CSV row parser (handles quoted fields with commas, like the MailerSend exports). */
function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inQuotes) {
			if (c === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
				} else inQuotes = false;
			} else current += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ",") {
			fields.push(current);
			current = "";
		} else current += c;
	}
	fields.push(current);
	return fields;
}

function extractEmails(csvPaths: string[]): { email: string; source: string }[] {
	const emails: { email: string; source: string }[] = [];
	for (const csvPath of csvPaths) {
		const content = readFileSync(csvPath, "utf8");
		const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
		const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
		const emailIndex = header.indexOf("email");
		if (emailIndex === -1) throw new Error(`No "Email" column found in ${csvPath}`);
		for (const line of lines.slice(1)) {
			const fields = parseCsvLine(line);
			const email = (fields[emailIndex] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
			if (email && email.includes("@")) emails.push({ email, source: path.basename(csvPath) });
		}
	}
	// Dedupe, keeping the first filename.
	const seen = new Set<string>();
	return emails.filter((e) => {
		const key = e.email.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function main() {
	const argv = process.argv.slice(2);
	const csvPaths: string[] = [];
	let prod = false;
	let yes = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--db") prod = argv[++i] === "prod";
		else if (a === "--yes") yes = true;
		else if (!a.startsWith("-")) csvPaths.push(a);
	}
	const db: DBKind = prod ? "sqlite-prod" : "sqlite-dev";
	const envDir = path.resolve(import.meta.dir, "..");
	// `--db prod` is explicit, so the matching env file wins over the
	// `.env.development` Bun auto-loaded (see src/loadEnvFile.ts).
	loadEnvFile(path.join(envDir, prod ? ".env.production" : ".env.development"), { override: true });

	if (csvPaths.length === 0) {
		console.error("Usage: bun run remove-suppressed <csv...> [--db prod] [--yes]");
		process.exit(1);
	}
	if (prod && !yes) {
		console.error("Safety: refusing to modify the production DB without --yes. Run a dry run first: bun run remove-suppressed <csv...> --db prod");
		process.exit(1);
	}

	const emails = extractEmails(csvPaths);
	console.log(`Parsed ${emails.length} unique suppressed email(s) from ${csvPaths.length} CSV file(s).`);

	const conn = createDbConnection(db);
	if (!prod) {
		const placeholders = emails.map(() => "?").join(",");
		const found = await conn.execute({
			sql: `SELECT email FROM email_subscriptions WHERE LOWER(TRIM(email)) IN (${placeholders}) ORDER BY email`,
			args: emails.map((e) => e.email),
		});
		console.log(`\nDry run (preview D1, byzantini-db-preview): ${found.rows.length} row(s) would be deleted.`);
		for (const row of found.rows) console.log("  " + String(row.email));
		return;
	}

	const placeholders = emails.map(() => "?").join(",");
	const result = await conn.execute({
		sql: `DELETE FROM email_subscriptions WHERE LOWER(TRIM(email)) IN (${placeholders})`,
		args: emails.map((e) => e.email),
	});
	console.log(`Deleted ${result.rowsAffected} row(s) from email_subscriptions (PRODUCTION).`);
	for (const e of emails) console.log("  removed: " + e.email);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

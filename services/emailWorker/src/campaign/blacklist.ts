import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Campaign opt-outs. The lists hold real people's contact details, so they are
 * NOT in the repository: they live in `campaign-blocklist.json` next to
 * package.json (gitignored, like every *.json here except package/tsconfig),
 * or wherever `CAMPAIGN_BLOCKLIST_FILE` points. Shape:
 *
 *   { "emails": ["someone@example.gr"], "phones": ["+3069…"] }
 *
 * `phones` are E.164 so they compare against the normalised recipient list. A
 * recipient who replies STOP to an SMS is suppressed by Bird itself; one who
 * asks the secretariat by phone has to be recorded here.
 *
 * A missing file is an error, not an empty list: sending a campaign to people
 * who opted out is worse than not sending it.
 */
type Blocklist = { emails: string[]; phones: string[] };

const DEFAULT_FILE = path.resolve(import.meta.dir, "../../campaign-blocklist.json");

function loadBlocklist(): Blocklist {
    const file = process.env.CAMPAIGN_BLOCKLIST_FILE || DEFAULT_FILE;
    if (!existsSync(file)) {
        throw new Error(`Campaign blocklist not found at ${file}. Create it (see README, "Opt-outs") or set CAMPAIGN_BLOCKLIST_FILE.`);
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Blocklist>;
    return {
        emails: (parsed.emails ?? []).map((email) => email.trim().toLowerCase()),
        phones: parsed.phones ?? [],
    };
}

function filterBlacklisted(emails: string[]): string[];
function filterBlacklisted<T extends { email?: string; }>(emails: T[]): T[];
function filterBlacklisted(emails: string[] | { email?: string; }[]): typeof emails {
    // An empty list is a legitimate input (a query that matched nobody, or a
    // --limit of 0) and used to fall through to the "Invalid input" throw below.
    if (emails.length === 0) return emails;
    const blacklist = loadBlocklist().emails;
    const isBlocked = (email: string | undefined) => !!email && blacklist.includes(email.trim().toLowerCase());
    if (typeof emails[0] === "string") {
        return emails.filter((email) => !isBlocked(email as string)) as typeof emails;
    } else if (emails[0] && typeof emails[0] === "object" && "email" in emails[0]) {
        return emails.filter((obj) => !isBlocked((obj as { email: string; })["email"])) as typeof emails;
    } else {
        throw new Error("Invalid input to filterBlacklisted");
    }
};

/**
 * Drops recipients whose phone number is on the SMS opt-out list.
 *
 * Kept separate from {@link filterBlacklisted} because the two lists are
 * genuinely different: a student can unsubscribe from email and still be happy
 * to receive an SMS reminder, and vice versa.
 */
function filterBlacklistedPhones<T extends { phone?: string }>(recipients: T[]): T[] {
    const phoneBlacklist = loadBlocklist().phones;
    return recipients.filter((r) => !r.phone || !phoneBlacklist.includes(r.phone));
}

export { filterBlacklisted, filterBlacklistedPhones };

import { describe, expect, test } from "bun:test";
import {
	DIGEST_LIMIT,
	RETENTION_MS,
	digestSubject,
	renderDigest,
	runErrorDigest,
	type DeliverFn,
	type DigestDb,
	type SysErrorRow,
} from "../src/errorDigest";

/**
 * The «Σφάλματα» digest (src/errorDigest.ts) against a fake D1 — no workerd, no network: `deliver` is a
 * recorder, so nothing can ever be sent from here.
 */

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

const row = (id: number, patch: Partial<SysErrorRow> = {}): SysErrorRow => ({
	id,
	source: "Pupils.post",
	status: 500,
	error_name: "Error",
	message: "D1_ERROR: something broke",
	host: "musicschool-metamorfosi.gr",
	count: 1,
	first_seen_at: NOW - 3_600_000,
	last_seen_at: NOW - 60_000,
	notified_at: null,
	...patch,
});

/** Answers the three statements the digest runs; records every query with its arguments. */
function fakeDb(errors: SysErrorRow[], admins: string[]) {
	const calls: { query: string; args: unknown[] }[] = [];
	const db: DigestDb = {
		prepare(query) {
			return {
				bind(...args) {
					calls.push({ query, args });
					return {
						async all<T>() {
							if (query.includes("FROM sys_errors")) {
								const fresh = errors.filter((e) => e.last_seen_at > (e.notified_at ?? 0));
								return { results: fresh.slice(0, args[0] as number) as T[] };
							}
							if (query.includes("FROM sys_users")) return { results: admins.map((email) => ({ email })) as T[] };
							throw new Error(`unexpected query ${query}`);
						},
						async run() {
							return {};
						},
					};
				},
			};
		},
	};
	return { db, calls };
}

const recorder = () => {
	const sent: Parameters<DeliverFn>[0][] = [];
	const deliver: DeliverFn = async (email) => void sent.push(email);
	return { sent, deliver };
};

describe("runErrorDigest", () => {
	test("nothing new → no email, no update; old rows are still pruned", async () => {
		const { db, calls } = fakeDb([row(1, { notified_at: NOW - 30_000 })], ["sys@example.org"]);
		const { sent, deliver } = recorder();
		expect(await runErrorDigest(db, deliver, NOW)).toEqual({ sent: 0, errors: 0, pruned: true });
		expect(sent).toEqual([]);
		expect(calls[0]).toEqual({ query: "DELETE FROM sys_errors WHERE last_seen_at < ?", args: [NOW - RETENTION_MS] });
		expect(calls.some((c) => c.query.startsWith("UPDATE"))).toBe(false);
	});

	test("new and recurring errors go to every sysadmin, then are marked notified", async () => {
		const errors = [row(1, { count: 3 }), row(2, { source: "page /admin", notified_at: NOW - 600_000 })];
		const { db, calls } = fakeDb(errors, ["a@example.org", "b@example.org"]);
		const { sent, deliver } = recorder();
		expect(await runErrorDigest(db, deliver, NOW)).toEqual({ sent: 2, errors: 2, pruned: true });
		expect(sent.map((e) => e.to)).toEqual(["a@example.org", "b@example.org"]);
		expect(sent[0]!.subject).toBe("[Ιστοσελίδα] 2 σφάλματα διακομιστή (4 φορές)");
		expect(sent[0]!.html).toContain("ξανά μετά την προηγούμενη ειδοποίηση");
		expect(calls.find((c) => c.query.includes("FROM sys_users"))!.query).toContain("role = 'sysadmin'");
		const update = calls.find((c) => c.query.startsWith("UPDATE"))!;
		expect(update.args).toEqual([NOW, 1, 2]);
	});

	test("a failed send leaves the rows unmarked, so the next run retries", async () => {
		const { db, calls } = fakeDb([row(1)], ["a@example.org"]);
		const failing: DeliverFn = async () => {
			throw new Error("MailerSend responded 500");
		};
		await expect(runErrorDigest(db, failing, NOW)).rejects.toThrow("MailerSend");
		expect(calls.some((c) => c.query.startsWith("UPDATE"))).toBe(false);
	});

	test("no sysadmin → nothing sent and nothing marked", async () => {
		const { db, calls } = fakeDb([row(1)], []);
		const { sent, deliver } = recorder();
		expect((await runErrorDigest(db, deliver, NOW)).sent).toBe(0);
		expect(sent).toEqual([]);
		expect(calls.some((c) => c.query.startsWith("UPDATE"))).toBe(false);
	});

	test("at most DIGEST_LIMIT rows per email", async () => {
		const errors = Array.from({ length: DIGEST_LIMIT + 5 }, (_, i) => row(i + 1, { source: `S.${i}` }));
		const { db } = fakeDb(errors, ["a@example.org"]);
		const { deliver } = recorder();
		expect((await runErrorDigest(db, deliver, NOW)).errors).toBe(DIGEST_LIMIT);
	});
});

describe("renderDigest", () => {
	test("escapes what the site stored", () => {
		const html = renderDigest([row(1, { source: "page /<script>", message: 'x "<img src=y>" & z' })], NOW);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).toContain("page /&lt;script&gt;");
		expect(html).toContain("&quot;&lt;img src=y&gt;&quot; &amp; z");
		expect(html).toContain("https://musicschool-metamorfosi.gr/admin/errors");
	});

	test("subject counts kinds and occurrences", () => {
		expect(digestSubject([row(1)])).toBe("[Ιστοσελίδα] 1 σφάλμα διακομιστή (1 φορά)");
	});
});

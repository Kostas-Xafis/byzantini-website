/**
 * «Σφάλματα» (Errors.*) and the uptime route (Health.get). The recording itself (APIServer.onServerError →
 * lib/errors/record.server.ts) is unit-tested in tests/unit/apiDispatch.test.ts; here a row is seeded in the local
 * dev DB and read / deleted through the API.
 */
import { z_SysError } from "@lib/api/schemas";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { withLocalDb } from "../localDb";
import { rawAPI } from "../rawAPI";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

test("--health-- answers ok without a session", async () => {
	const res = await rawAPI("GET", "/health");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ data: { ok: true } });
});

test("--errors-- the sysadmin lists and deletes recorded errors; anonymous callers get 401", async () => {
	expect((await rawAPI("GET", "/sys/errors")).status).toBe(401);
	expect((await rawAPI("DELETE", "/sys/errors", [1])).status).toBe(401);

	const now = Date.now();
	const fingerprint = `test|${now}`;
	const seeded = withLocalDb((db) => {
		db.run(
			"INSERT INTO sys_errors (fingerprint, source, status, error_name, message, host, count, first_seen_at, last_seen_at) VALUES (?, 'Unit.test', 500, 'Error', 'seeded by tests/api/errors.test.ts', 'localhost:4321', 3, ?, ?)",
			[fingerprint, now, now],
		);
		return (db.query("SELECT id FROM sys_errors WHERE fingerprint = ?").get(fingerprint) as { id: number }).id;
	});
	if (!seeded) return; // no local dev DB

	const list = await getJson<APIResponse["Errors.list"]>(await useTestAPI("Errors.list"));
	expectBody(list, z.array(z_SysError));
	expect(list.data.find((row: { id: number }) => row.id === seeded)).toMatchObject({ source: "Unit.test", count: 3, notified_at: null });

	const removed = await getJson<APIResponse["Errors.delete"]>(await useTestAPI("Errors.delete", { RequestObject: [seeded] }));
	expectBody(removed, "Το σφάλμα διαγράφηκε");
	const after = await getJson<APIResponse["Errors.list"]>(await useTestAPI("Errors.list"));
	expect(after.data.some((row: { id: number }) => row.id === seeded)).toBe(false);
});

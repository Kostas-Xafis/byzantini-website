import { afterAll, expect, test } from "bun:test";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { uniqueTestAm } from "../localDb.ts";
import { getJson, useTestAPI } from "../testHelpers.ts";

// «Διέκοψε» and «Μετεγγραφή» on the pupil (migration 0014): set from the Μαθητολόγιο's edit form, filtered in the
// search, and a stopped pupil who enrolls in a later year loses the mark by itself.

const created: number[] = [];
afterAll(async () => {
	for (const id of created) await useTestAPI("Pupils.delete", { RequestObject: { id, unsubscribe: true } });
});

const get = async (id: number) => (await getJson<APIResponse["Pupils.get"]>(await useTestAPI("Pupils.get", { UrlArgs: { id } }))).data.pupil;
const search = async (status: "stopped" | "transfer", am: number) =>
	(await getJson<APIResponse["Pupils.search"]>(await useTestAPI("Pupils.search", { RequestObject: { query: String(am), status } }))).data.rows;
const enroll = (pupil_id: number, registration_year: string) =>
	useTestAPI("Pupils.enroll", {
		RequestObject: { pupil_id, registration_year, class_id: 0, class_year: "Α' Έτος", teacher_id: -1, instrument_id: 0, date: Date.now(), pass: false },
	});

test("--pupils status-- set, filter, and cleared when the pupil comes back", async () => {
	const am = uniqueTestAm();
	const res = await useTestAPI("Pupils.create", {
		RequestObject: {
			am,
			last_name: "Μαθητής",
			first_name: "Δοκιμαστικός",
			email: `pupils.test.status.${Date.now().toString(36)}@example.com`,
			transfer_year: "2017-2018",
			transfer_from: "Ωδείο Δοκιμής",
		},
	});
	expect(res.status).toBe(200);
	const { id } = (await getJson<APIResponse["Pupils.create"]>(res)).data;
	created.push(id);
	expect(await get(id)).toMatchObject({ transfer_year: "2017-2018", transfer_from: "Ωδείο Δοκιμής", stopped_year: "" });

	expect((await enroll(id, "2017-2018")).status).toBe(200);
	expect((await useTestAPI("Pupils.update", { RequestObject: { id, stopped_year: "2017-2018" } })).status).toBe(200);
	// '2017-18' is not a school year as the register writes it (the client validates before sending).
	await expect(useTestAPI("Pupils.update", { RequestObject: { id, stopped_year: "2017-18" } as never })).rejects.toThrow("Μη έγκυρο σχολικό έτος");
	expect((await search("stopped", am)).map((row) => [row.id, row.stopped_year])).toEqual([[id, "2017-2018"]]);
	expect((await search("transfer", am)).map((row) => row.id)).toEqual([id]);

	// History filled in for the same or an earlier year keeps the mark; a later year means they came back.
	expect((await enroll(id, "2016-2017")).status).toBe(200);
	expect((await get(id)).stopped_year).toBe("2017-2018");
	expect((await enroll(id, "2019-2020")).status).toBe(200);
	expect((await get(id)).stopped_year).toBe("");
	expect(await search("stopped", am)).toEqual([]);
});

import type { Instruments } from "@_types/entities";
import { z_Instruments } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { test } from "bun:test";
import { z } from "astro/zod";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

function instrumentsTest() {
	const instrument: Omit<Instruments, "id"> = {
		name: "Sample Instrument",
		type: R.item(["eur", "par"]),
		isInstrument: true,
	};
	let newInstrumentId: number | null;

	test("--instruments-- #1", async () => {
		const res = await useTestAPI("Instruments.post", {
			RequestObject: instrument,
		});

		const json = await getJson<APIResponse["Instruments.post"]>(res);
		expectBody(json, z.object({ insertId: z.number() }));

		newInstrumentId = json.data.insertId;
	});
	test("--instruments-- #2", async () => {
		const res = await useTestAPI("Instruments.getById", {
			RequestObject: [newInstrumentId as number],
		});

		const json = await getJson<APIResponse["Instruments.getById"]>(res);
		expectBody(json, z_Instruments);
	});
	test("--instruments-- #3", async () => {
		const res = await useTestAPI("Instruments.delete", {
			RequestObject: [newInstrumentId as number],
		});

		const json = await getJson<APIResponse["Instruments.delete"]>(res);
		expectBody(json, "Teacher/s deleted successfully");
	});
}

instrumentsTest();

test("--instruments--", async () => {
	const res = await useTestAPI("Instruments.get");

	const json = await getJson<APIResponse["Instruments.get"]>(res);
	expectBody(json, z.array(z_Instruments));
});

import { v_Instruments, type Instruments } from "@_types/entities";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { chain, test } from "tests/TestChain";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

function instrumentsTest() {
	const instrument: Omit<Instruments, "id"> = {
		name: "Sample Instrument",
		type: R.item(["eur", "par"]),
		isInstrument: true,
	};
	let newInstrumentId: number | null;

	chain("--instruments--",
		async () => {
			const res = await useTestAPI("Instruments.post", {
				RequestObject: instrument,
			});

			const json = await getJson<APIResponse["Instruments.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newInstrumentId = json.data.insertId;
		},
		async () => {
			const res = await useTestAPI("Instruments.getById", {
				RequestObject: [newInstrumentId as number]
			});

			const json = await getJson<APIResponse["Instruments.getById"]>(res);
			expectBody(json, v_Instruments);
		},
		async () => {
			const res = await useTestAPI("Instruments.delete", {
				RequestObject: [newInstrumentId as number]
			});

			const json = await getJson<APIResponse["Instruments.delete"]>(res);
			expectBody(json, "Teacher/s deleted successfully");
		}
	);
}

instrumentsTest();

test("--instruments--", async () => {
	const res = await useTestAPI("Instruments.get");

	const json = await getJson<APIResponse["Instruments.get"]>(res);
	expectBody(json, array(v_Instruments));
});

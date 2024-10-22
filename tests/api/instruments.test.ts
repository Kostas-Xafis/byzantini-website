import { array, number, object } from "valibot";
import { Random as R } from "../../lib/random";
import { APIResponse } from "../../lib/routes/index.client";
import { Instruments, v_Instruments } from "../../types/entities";
import { chain, expectBody, getJson, test, useTestAPI } from "../testHelpers";

const label = (str: string) => {
	return "--instruments-- " + str;
};

function instrumentsTest() {
	const instrument: Omit<Instruments, "id"> = {
		name: "Sample Instrument",
		type: R.item(["eur", "par"]),
		isInstrument: true,
	};
	let newInstrumentId: number | null;

	chain([
		label("POST /instruments"), async () => {
			const res = await useTestAPI("Instruments.post", {
				RequestObject: instrument,
			});

			const json = await getJson<APIResponse["Instruments.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newInstrumentId = json.data.insertId;
		}],
		[
			label("GET /instruments/id"), async () => {
				const res = await useTestAPI("Instruments.getById", {
					RequestObject: [newInstrumentId as number]
				});

				const json = await getJson<APIResponse["Instruments.getById"]>(res);
				expectBody(json, v_Instruments);
			}],
		[
			label("DELETE /instruments"), async () => {
				const res = await useTestAPI("Instruments.delete", {
					RequestObject: [newInstrumentId as number]
				});

				const json = await getJson<APIResponse["Instruments.delete"]>(res);
				expectBody(json, "Teacher/s deleted successfully");
			}]
	);
}

instrumentsTest();

test(label("GET /instruments"), async () => {
	const res = await useTestAPI("Instruments.get");

	const json = await getJson<APIResponse["Instruments.get"]>(res);
	expectBody(json, array(v_Instruments));
});

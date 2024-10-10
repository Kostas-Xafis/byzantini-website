import { expect } from "bun:test";
import { array, number, object } from "valibot";
import { APIResponse } from "../../lib/routes/index.client";
import { Locations, v_Locations } from "../../types/entities";
import { getJson, expectBody, useTestAPI, chain, test } from "../testHelpers";
import { Random as R } from "../../lib/random";


const label = (str: string) => {
	return "--locations-- " + str;
};


function locationsTest() {
	const location = {
		name: "Sample Location",
		address: "Sample Address",
		areacode: R.int(10000, 99999),
		municipality: "Sample Municipality",
		email: R.email(),
		manager: "Sample Manager",
		telephones: R.array(2).string(10, "0-9").join(", "),
		priority: R.int(1, 10),
		map: "Sample Map",
		link: R.string(10, "0-9"),
		youtube: R.string(10, "0-9"),
		partner: R.boolean(),
	} as Locations;
	let newLocationId: number | null = null;
	chain([
		label("POST /locations"), async () => {
			const res = await useTestAPI("Locations.post", {
				RequestObject: location,
			});

			const json = await getJson<APIResponse["Locations.post"]>(res);
			expectBody(json, object({ insertId: number() }));
			newLocationId = json.data.insertId;
		}],
		[
			label("PUT /locations/file/[id:number]"), async () => {
				const imgBlob = Bun.file("./public/logo.png");
				const res = await useTestAPI("Locations.fileUpload", {
					UrlArgs: { id: newLocationId as number },
					RequestObject: imgBlob,
				});

				const text = await getJson<APIResponse["Locations.fileUpload"]>(res);
				expectBody(text, "Image uploaded successfully");
			}],
		[
			label("GET /locations/:id"), async () => {
				const res = await useTestAPI("Locations.getById", {
					RequestObject: [newLocationId as number]
				});

				const json = await getJson<APIResponse["Locations.getById"]>(res);
				expectBody(json, v_Locations);
			}],
		[
			label("PUT /locations"), async () => {
				const updatedLocation = {
					...location,
					id: newLocationId as number,
					name: "Updated Location"
				};
				const res = await useTestAPI("Locations.update", {
					RequestObject: updatedLocation,
				});

				const text = await getJson<APIResponse["Locations.update"]>(res);
				expectBody(text, "Location updated successfully");
			}],
		[
			label("DELETE /locations"), async () => {
				const res = await useTestAPI("Locations.delete", {
					RequestObject: [newLocationId as number]
				});

				const text = await getJson<APIResponse["Locations.delete"]>(res);
				expectBody(text, "Locations deleted successfully");
			}
		]
	);
}

locationsTest();

test(label("GET /locations"), async () => {
	const res = await useTestAPI("Locations.get");

	const json = await getJson<APIResponse["Locations.get"]>(res);
	expectBody(json, array(v_Locations));
});

test(label("GET /locations/priority"), async () => {
	const res = await useTestAPI("Locations.getByPriority");

	const json = await getJson<APIResponse["Locations.getByPriority"]>(res);
	expectBody(json, array(v_Locations));
	let isSorted = true;
	for (let i = 1; i < json.data.length; i++) {
		const location = json.data[i];
		if (i > 0 && location.priority < json.data[i - 1].priority) {
			isSorted = false;
		}
	}
	expect(isSorted).toBe(true);
});

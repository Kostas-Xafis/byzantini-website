import type { Locations } from "@_types/entities";
import { z_LocationsResponse } from "@lib/api/schemas";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { expect, test } from "bun:test";
import { z } from "astro/zod";
import { fileBaseName } from "@lib/bucket/fileNames";
import { expectBody, fetchBucketFile, getJson, useTestAPI } from "../testHelpers";

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
	test("--locations-- #1", async () => {
		const res = await useTestAPI("Locations.post", {
			RequestObject: location,
		});

		const json = await getJson<APIResponse["Locations.post"]>(res);
		expectBody(json, z.object({ insertId: z.number() }));
		newLocationId = json.data.insertId;
	});
	test("--locations-- #2", async () => {
		const imgBlob = Bun.file("./public/logo.png");
		const res = await useTestAPI("Locations.fileUpload", {
			UrlArgs: { id: newLocationId as number },
			RequestObject: imgBlob,
		});

		const text = await getJson<APIResponse["Locations.fileUpload"]>(res);
		expectBody(text, "Image uploaded successfully");
	});
	const storedImage = async () => {
		const json = await getJson<APIResponse["Locations.getById"]>(await useTestAPI("Locations.getById", { RequestObject: [newLocationId as number] }));
		expectBody(json, z_LocationsResponse);
		return json.data.image ?? null;
	};
	test("--locations-- #3", async () => {
		const res = await useTestAPI("Locations.getById", {
			RequestObject: [newLocationId as number],
		});

		const json = await getJson<APIResponse["Locations.getById"]>(res);
		expectBody(json, z_LocationsResponse);
	});
	test("--locations-- #3b a re-upload gets a new versioned name and replaces the previous file", async () => {
		const first = await storedImage();
		expect(first).toMatch(/^Sample Location-[0-9a-z]{8}\.png$/);
		await Bun.sleep(5);

		const res = await useTestAPI("Locations.fileUpload", { UrlArgs: { id: newLocationId as number }, RequestObject: Bun.file("./public/logo.png") });
		expectBody(await getJson<APIResponse["Locations.fileUpload"]>(res), "Image uploaded successfully");

		const second = await storedImage();
		expect(second).not.toBe(first);
		expect(fileBaseName(second as string)).toBe("Sample Location");
		expect(await fetchBucketFile(`spoudastiria/${second}`)).not.toBeNull();
		expect(await fetchBucketFile(`spoudastiria/${first}`)).toBeNull();
	});
	test("--locations-- #4", async () => {
		const updatedLocation = {
			...location,
			id: newLocationId as number,
			name: "Updated Location",
		};
		const res = await useTestAPI("Locations.update", {
			RequestObject: updatedLocation,
		});

		const text = await getJson<APIResponse["Locations.update"]>(res);
		expectBody(text, "Location updated successfully");
	});
	test("--locations-- #4b a renamed location's image follows the new name", async () => {
		const image = await storedImage();
		expect(image).toMatch(/^Updated Location-[0-9a-z]{8}\.png$/);
		expect(await fetchBucketFile(`spoudastiria/${image}`)).not.toBeNull();
	});
	test("--locations-- #5", async () => {
		const res = await useTestAPI("Locations.delete", {
			RequestObject: [newLocationId as number],
		});

		const text = await getJson<APIResponse["Locations.delete"]>(res);
		expectBody(text, "Locations deleted successfully");
	});
}

locationsTest();

test("--locations--", async () => {
	const res = await useTestAPI("Locations.get");

	const json = await getJson<APIResponse["Locations.get"]>(res);
	expectBody(json, z.array(z_LocationsResponse));
});

test("--locations--", async () => {
	const res = await useTestAPI("Locations.getByPriority");

	const json = await getJson<APIResponse["Locations.getByPriority"]>(res);
	expectBody(json, z.array(z_LocationsResponse));
	let isSorted = true;
	for (let i = 1; i < json.data.length; i++) {
		const location = json.data[i];
		if (i > 0 && location.priority < json.data[i - 1].priority) {
			isSorted = false;
		}
	}
	expect(isSorted).toBe(true);
});

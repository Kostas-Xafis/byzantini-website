import { v_TeacherClasses, v_TeacherInstruments, v_TeacherLocations, v_Teachers } from "@_types/entities";
import { Bucket } from "@bucket/index.ts";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { chain, test } from "tests/TestChain";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers.ts";

const areBuffersEqual = (first: ArrayBuffer, second: ArrayBuffer) => {
	const firstView = new Uint8Array(first);
	const secondView = new Uint8Array(second);
	if (firstView.length !== secondView.length) return false;
	for (let i = 0; i < firstView.length; i++) {
		if (firstView[i] !== secondView[i]) return false;
	}
	return true;
};

const isMissingObjectError = (err: unknown) => {
	if (!(err instanceof Error)) return false;
	const msg = err.message || "";
	return msg.includes("NoSuchKey") || msg.includes("404") || msg.includes("does not exist");
};

function teachersTest() {
	const teacher = {
		fullname: "John Doe",
		amka: R.string(11, "0-9"),
		email: R.email(),
		telephone: R.string(10, "0-9"),
		linktree: "http://linktree.com/johndoe",
		gender: R.item(["M", "F"]) as "M" | "F",
		title: R.int(0, 2) as 0 | 1 | 2,
		visible: R.boolean(),
		online: R.boolean(),
		teacherClasses: R.uniqueArray(R.int(1, 2), () => R.int(0, 2)),
		priorities: [1, 2],
		registrations_number: ["10", "20"],
		teacherLocations: R.uniqueArray(R.int(1, 5), () => R.int(3, 15)),
		teacherInstruments: [1, 2]
	};
	let newTeacherId: number | null;

	chain("--teachers--",
		async () => {
			const res = await useTestAPI("Teachers.post", {
				RequestObject: teacher,
			});

			const json = await getJson<APIResponse["Teachers.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newTeacherId = json.data.insertId;
		},
		async () => {
			const pdfBlob = Bun.file("./notAssets/pdf_templates/byz_template.pdf");
			const expectedBuffer = await pdfBlob.arrayBuffer();
			const res = await useTestAPI("Teachers.fileUpload", {
				UrlArgs: { id: newTeacherId as number },
				RequestObject: pdfBlob,
			});

			const json = await getJson<APIResponse["Teachers.fileUpload"]>(res);
			expectBody(json, "Pdf uploaded successfully");

			const teacherRes = await useTestAPI("Teachers.getById", {
				RequestObject: [newTeacherId as number]
			});
			const teacherJson = await getJson<APIResponse["Teachers.getById"]>(teacherRes);
			expectBody(teacherJson, v_Teachers);

			if (teacherJson.type !== "data" || teacherJson.data.cv == null) {
				throw new Error("Teacher CV was not saved after upload");
			}

			const uploadedFile = await Bucket.getDev(`kathigites/cv/${teacherJson.data.cv}`);
			if (uploadedFile == null) {
				throw new Error("Uploaded teacher CV file was not found in bucket");
			}

			if (!areBuffersEqual(expectedBuffer, uploadedFile)) {
				throw new Error("Uploaded teacher CV content does not match the source file");
			}
		},
		async () => {
			const res = await useTestAPI("Teachers.fileRename", {
				UrlArgs: { id: newTeacherId as number },
			});

			const json = await getJson<APIResponse["Teachers.fileRename"]>(res);
			expectBody(json, "Files renamed successfully");
		},
		async () => {
			const beforeDeleteRes = await useTestAPI("Teachers.getById", {
				RequestObject: [newTeacherId as number]
			});
			const beforeDeleteJson = await getJson<APIResponse["Teachers.getById"]>(beforeDeleteRes);
			expectBody(beforeDeleteJson, v_Teachers);
			if (beforeDeleteJson.type !== "data" || beforeDeleteJson.data.cv == null) {
				throw new Error("Expected teacher CV to exist before deletion");
			}
			const deletedCvFilename = beforeDeleteJson.data.cv;

			const res = await useTestAPI("Teachers.fileDelete", {
				RequestObject: { id: newTeacherId as number, type: "cv" }
			});

			const json = await getJson<APIResponse["Teachers.fileDelete"]>(res);
			expectBody(json, "Pdf deleted successfully");

			const afterDeleteRes = await useTestAPI("Teachers.getById", {
				RequestObject: [newTeacherId as number]
			});
			const afterDeleteJson = await getJson<APIResponse["Teachers.getById"]>(afterDeleteRes);
			expectBody(afterDeleteJson, v_Teachers);
			if (afterDeleteJson.type !== "data" || afterDeleteJson.data.cv != null) {
				throw new Error("Teacher CV was not cleared after deletion");
			}

			try {
				const deletedFile = await Bucket.getDev(`kathigites/cv/${deletedCvFilename}`);
				if (deletedFile != null) {
					throw new Error("Teacher CV file still exists in bucket after deletion");
				}
			} catch (err) {
				if (!isMissingObjectError(err)) throw err;
			}
		},
		async () => {
			const res = await useTestAPI("Teachers.getById", {
				RequestObject: [newTeacherId as number]
			});

			const json = await getJson<APIResponse["Teachers.getById"]>(res);
			expectBody(json, v_Teachers);
		},
		async () => {
			const updatedTeacher = {
				...teacher,
				id: newTeacherId as number,
				email: R.email(),
				telephone: R.string(10, "0-9"),
				visible: R.boolean(),
			};
			const res = await useTestAPI("Teachers.update", {
				RequestObject: updatedTeacher,
			});

			const json = await getJson<APIResponse["Teachers.update"]>(res);
			expectBody(json, "Teacher added successfully");
		},
		async () => {
			const res = await useTestAPI("Teachers.delete", {
				RequestObject: [newTeacherId as number]
			});

			const json = await getJson<APIResponse["Teachers.delete"]>(res);
			expectBody(json, "Teacher/s deleted successfully");
		}
	);
}

function teachersClassesTest() {
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getClasses");

		const json = await getJson<APIResponse["Teachers.getClasses"]>(res);
		expectBody(json, array(v_TeacherClasses));
	});
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getClassesById", {
			RequestObject: [1]
		});

		const json = await getJson<APIResponse["Teachers.getClassesById"]>(res);
		expectBody(json, array(v_TeacherClasses));
	});
}

function teachersLocationsTest() {
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getLocations");

		const json = await getJson<APIResponse["Teachers.getLocations"]>(res);
		expectBody(json, array(v_TeacherLocations));
	});
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getLocationsById", {
			RequestObject: [1]
		});

		const json = await getJson<APIResponse["Teachers.getLocationsById"]>(res);
		expectBody(json, array(v_TeacherLocations));
	});
}

function teachersInstrumentsTest() {
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getInstruments");

		const json = await getJson<APIResponse["Teachers.getInstruments"]>(res);
		expectBody(json, array(v_TeacherInstruments));
	});
	test("--teachers--", async () => {
		const res = await useTestAPI("Teachers.getInstrumentsById", {
			RequestObject: [1]
		});

		const json = await getJson<APIResponse["Teachers.getInstrumentsById"]>(res);
		expectBody(json, array(v_TeacherInstruments));
	});
}

teachersTest();
teachersClassesTest();
teachersLocationsTest();
teachersInstrumentsTest();

test("--teachers--", async () => {
	try {
		const res = await useTestAPI("Teachers.get");

		const json = await getJson<APIResponse["Teachers.get"]>(res);
		expectBody(json, array(v_Teachers));
	} catch (err) {
		console.error({ err });
	}
});

test("--teachers--", async () => {
	const res = await useTestAPI("Teachers.getByFullnames");

	const json = await getJson<APIResponse["Teachers.getByFullnames"]>(res);
	expectBody(json, array(v_Teachers));
});

test("--teachers--", async () => {
	const res = await useTestAPI("Teachers.getByPriorityClasses", {
		UrlArgs: { class_type: "byz" }
	});

	const json = await getJson<APIResponse["Teachers.getByPriorityClasses"]>(res);
	expectBody(json, array(v_Teachers));
});

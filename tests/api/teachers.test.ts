import { array, number, object } from "valibot";
import { APIResponse } from "../../lib/routes/index.client.ts";
import { v_Teachers, v_TeacherClasses, v_TeacherLocations, v_TeacherInstruments } from "../../types/entities";
import { getJson, expectBody, useTestAPI, chain, test } from "../testHelpers.ts";
import { Random as R } from "../../lib/random.ts";

const label = (str: string) => {
	return "--teachers-- " + str;
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

	chain([
		label("POST /teachers"), async () => {
			const res = await useTestAPI("Teachers.post", {
				RequestObject: teacher,
			});

			const json = await getJson<APIResponse["Teachers.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newTeacherId = json.data.insertId;
		}],
		[
			// TODO: Test that the file is actually uploaded and is the same as the one we sent
			label("POST PDF /teachers/file/[id:number]"), async () => {
				const pdfBlob = Bun.file("./notAssets/pdf_templates/byz_template.pdf");
				const res = await useTestAPI("Teachers.fileUpload", {
					UrlArgs: { id: newTeacherId as number },
					RequestObject: pdfBlob,
				});

				const json = await getJson<APIResponse["Teachers.fileUpload"]>(res);
				expectBody(json, "Pdf uploaded successfully");
			}],
		[
			label("PUT /teachers/file/rename/[id:number]"), async () => {
				const res = await useTestAPI("Teachers.fileRename", {
					UrlArgs: { id: newTeacherId as number },
				});

				const json = await getJson<APIResponse["Teachers.fileRename"]>(res);
				expectBody(json, "Files renamed successfully");
			}],
		[
			label("DELETE /teachers/file"), async () => {
				const res = await useTestAPI("Teachers.fileDelete", {
					RequestObject: { id: newTeacherId as number, type: "cv" }
				});

				const json = await getJson<APIResponse["Teachers.fileDelete"]>(res);
				expectBody(json, "Pdf deleted successfully");
			}],
		[
			label("GET /teachers/:id"), async () => {
				const res = await useTestAPI("Teachers.getById", {
					RequestObject: [newTeacherId as number]
				});

				const json = await getJson<APIResponse["Teachers.getById"]>(res);
				expectBody(json, v_Teachers);
			}],
		[
			label("PUT /teachers"), async () => {
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
			}],
		[
			label("DELETE /teachers"), async () => {
				const res = await useTestAPI("Teachers.delete", {
					RequestObject: [newTeacherId as number]
				});

				const json = await getJson<APIResponse["Teachers.delete"]>(res);
				expectBody(json, "Teacher/s deleted successfully");
			}]
	);
}

function teachersClassesTest() {
	test(label("GET /teachers/classes"), async () => {
		const res = await useTestAPI("Teachers.getClasses");

		const json = await getJson<APIResponse["Teachers.getClasses"]>(res);
		expectBody(json, array(v_TeacherClasses));
	});
	test(label("GET /teachers/classes/:id"), async () => {
		const res = await useTestAPI("Teachers.getClassesById", {
			RequestObject: [1]
		});

		const json = await getJson<APIResponse["Teachers.getClassesById"]>(res);
		expectBody(json, array(v_TeacherClasses));
	});
}

function teachersLocationsTest() {
	test(label("GET /teachers/locations"), async () => {
		const res = await useTestAPI("Teachers.getLocations");

		const json = await getJson<APIResponse["Teachers.getLocations"]>(res);
		expectBody(json, array(v_TeacherLocations));
	});
	test(label("GET /teachers/locations/:id"), async () => {
		const res = await useTestAPI("Teachers.getLocationsById", {
			RequestObject: [1]
		});

		const json = await getJson<APIResponse["Teachers.getLocationsById"]>(res);
		expectBody(json, array(v_TeacherLocations));
	});
}

function teachersInstrumentsTest() {
	test(label("GET /teachers/instruments"), async () => {
		const res = await useTestAPI("Teachers.getInstruments");

		const json = await getJson<APIResponse["Teachers.getInstruments"]>(res);
		expectBody(json, array(v_TeacherInstruments));
	});
	test(label("GET /teachers/instruments/:id"), async () => {
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

test(label("GET /teachers"), async () => {
	try {
		const res = await useTestAPI("Teachers.get");

		const json = await getJson<APIResponse["Teachers.get"]>(res);
		expectBody(json, array(v_Teachers));
	} catch (err) {
		console.error({ err });
	}
});

test(label("GET /teachers/fullnames"), async () => {
	const res = await useTestAPI("Teachers.getByFullnames");

	const json = await getJson<APIResponse["Teachers.getByFullnames"]>(res);
	expectBody(json, array(v_Teachers));
});

test(label("GET /teachers/priority-classes/:slug"), async () => {
	const res = await useTestAPI("Teachers.getByPriorityClasses", {
		UrlArgs: { class_type: "byz" }
	});

	const json = await getJson<APIResponse["Teachers.getByPriorityClasses"]>(res);
	expectBody(json, array(v_Teachers));
});

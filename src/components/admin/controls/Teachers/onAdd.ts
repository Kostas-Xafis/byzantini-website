import type { SimpleTeacher as Teachers } from "@_types/entities";
import type { HydrateByIdReturnType } from "@hooks/useHydrateById.solid";
import { FileHandler } from "@lib/fileHandling.client";
import { API, type APIResponse } from "@routes/index.client";
import { type ExtendedFormData } from "@utilities/forms";
import { createMemo } from "solid-js";
import { InputFields } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import {
	PREFIX,
	TeachersInputs,
	class_types,
	cvPreview,
	fileUpload,
	picturePreview,
	type APIHook,
	type TeacherJoins,
	type TeachersMetadata,
} from "./helpers";

export const onAdd = function (
	hydrate: HydrateByIdReturnType,
	store: Partial<APIResponse>,
	apiHook: APIHook
) {
	return createMemo((): Action | EmptyAction => {
		const addModal = {
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		if (!locations || !locationsList || !instruments) return addModal;

		const submit = async function (fd: ExtendedFormData<Teachers & TeacherJoins>) {
			const data: Omit<Teachers & TeacherJoins, "id"> = {
				fullname: fd.string("fullname"),
				amka: fd.string("amka", ""),
				email: fd.string("email"),
				telephone: fd.string("telephone"),
				linktree: fd.string("linktree"),
				gender: fd.multiSelect("gender", "boolean", { single: true }) ? "F" : "M",
				title: fd.multiSelect("title", "number", { single: true }) as 0 | 1 | 2,
				visible: fd.multiSelect("visible", "boolean", { single: true }),
				online: fd.multiSelect("online", "boolean", { single: true }),
				teacherClasses: fd.multiSelect("teacherClasses", "number", { single: false }),
				teacherLocations: fd.multiSelect("teacherLocations", "number", { single: false }),
				teacherInstruments: fd.getByName("teacherInstruments", "number", {
					cmp: "includes",
					single: false,
					isButton: true,
				}),
				priorities: fd.getByName("priority", "number", { single: false }),
				registrations_number: fd.getByName("ae-", "string", { single: false }),
			};
			const res = await apiHook(API.Teachers.post, { RequestObject: data });
			if (!res.data) return;
			const id = res.data.insertId;
			const pictureHandler = FileHandler.getHandler<TeachersMetadata>(
				PREFIX + addModal.type + "picture"
			);
			const cvHandler = FileHandler.getHandler<TeachersMetadata>(
				PREFIX + addModal.type + "cv"
			);
			pictureHandler.setMetadata({ teacher_id: id, type: "picture" });
			cvHandler.setMetadata({ teacher_id: id, type: "cv" });
			await Promise.all([
				fileUpload(pictureHandler, apiHook),
				fileUpload(cvHandler, apiHook),
			]);

			hydrate({ action: ActionEnum.ADD, id });
			pushAlert(createAlert("success", "Επιτυχής εισαγωγή καθηγητή"));
		};
		return {
			inputs: new InputFields(TeachersInputs(class_types, locations, instruments))
				.omit(["id"])
				.fill((field, key) => {
					if (key === "picture") {
						field.metadata = { teacher_id: 0, type: "picture" };
						field.filePreview = picturePreview as any;
					} else if (key === "cv") {
						field.metadata = { teacher_id: 0, type: "cv" };
						field.filePreview = cvPreview as any;
					}
				})
				.getInputs(),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Καθηγητή",
			...addModal,
		};
	});
};

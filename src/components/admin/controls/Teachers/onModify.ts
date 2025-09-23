import { createMemo } from "solid-js";
import { FileHandler } from "../../../../../lib/fileHandling.client";
import type { HydrateByIdReturnType } from "../../../../../lib/hooks/useHydrateById.solid";
import { API, type APIResponse } from "../../../../../lib/routes/index.client";
import { type ExtendedFormData } from "../../../../../lib/utilities/forms";
import type { SimpleTeacher as Teachers } from "../../../../../types/entities";
import { InputFields } from "../../../input/Input.solid";
import { createAlert, pushAlert } from "../../Alert.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "../../table/TableControlTypes";
import type { Action } from "../../table/TableControls.solid";
import {
	type APIHook,
	type TeacherJoins,
	type TeachersMetadata,
	PREFIX,
	TeachersInputs,
	class_types,
	cvPreview,
	fileDelete,
	fileUpload,
	picturePreview,
} from "./helpers";

export const onModify = function (
	hydrate: HydrateByIdReturnType,
	store: Partial<APIResponse>,
	selectedItems: number[],
	apiHook: APIHook
) {
	return createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const teachers = store[API.Teachers.get];
		if (!teachers || selectedItems.length !== 1) return modifyModal;

		const teacher = teachers.find((p) => p.id === selectedItems[0]);
		const classList = store[API.Teachers.getClasses];
		const locations = store[API.Locations.get];
		const locationsList = store[API.Teachers.getLocations];
		const instruments = store[API.Instruments.get];
		const teacherInstruments = store[API.Teachers.getInstruments];
		if (
			!teacher ||
			!classList ||
			!locations ||
			!locationsList ||
			!instruments ||
			!teacherInstruments
		)
			return modifyModal;

		const submit = async function (
			fd: ExtendedFormData<Teachers & TeacherJoins>,
			form?: HTMLFormElement
		) {
			if (!form) return;
			const classes = fd.multiSelect("teacherClasses", "number", { single: false });
			const data: Teachers & TeacherJoins = {
				id: teacher.id,
				fullname: fd.string("fullname"),
				amka: fd.string("amka", ""),
				email: fd.string("email"),
				telephone: fd.string("telephone"),
				linktree: fd.string("linktree"),
				gender: fd.multiSelect("gender", "number", { single: true }) ? "F" : "M",
				title: fd.multiSelect("title", "number", { single: true }) as 0 | 1 | 2,
				visible: fd.multiSelect("visible", "boolean", { single: true }),
				online: fd.multiSelect("online", "boolean", { single: true }),
				teacherClasses: classes,
				teacherInstruments: classes
					.map((c) => {
						return fd.multiSelect(
							(c === 1
								? "teacherInstrumentsTraditional"
								: c === 2
									? "teacherInstrumentsEuropean"
									: "") as any,
							"number"
						);
					})
					.flat() as number[],
				teacherLocations: fd.multiSelect("teacherLocations", "number", {
					single: false,
				}),
				priorities: fd.getByName("priority", "number", {
					cmp: "startsWith",
					single: false,
				}),
				registrations_number: fd.getByName("ae-", "string", {
					cmp: "startsWith",
					single: false,
				}),
			};
			const res = await apiHook(API.Teachers.update, { RequestObject: data });
			if (!res.data && !res.message) return;

			const pictureHandler = FileHandler.getHandler<TeachersMetadata>(
				PREFIX + modifyModal.type + "picture"
			);
			const cvHandler = FileHandler.getHandler<TeachersMetadata>(
				PREFIX + modifyModal.type + "cv"
			);
			pictureHandler.setMetadata({ teacher_id: teacher.id, type: "picture" });
			cvHandler.setMetadata({ teacher_id: teacher.id, type: "cv" });

			await Promise.all([
				fileDelete(pictureHandler, apiHook),
				fileDelete(cvHandler, apiHook),
			]);
			await Promise.all([
				fileUpload(pictureHandler, apiHook),
				fileUpload(cvHandler, apiHook),
			]);

			if (teacher.fullname !== data.fullname) {
				await apiHook(API.Teachers.fileRename, { UrlArgs: { id: teacher.id } });
			}

			hydrate({
				action: ActionEnum.MODIFY,
				id: teacher.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", "Επιτυχής ενημέρωση καθηγητή"));
		};
		return {
			inputs: new InputFields(
				TeachersInputs(
					class_types,
					locations,
					instruments,
					teacher,
					classList,
					locationsList,
					teacherInstruments
				)
			)
				.fill((field, key) => {
					if (key === "picture") {
						const metadata = { teacher_id: teacher.id, type: "picture" };
						field.metadata = metadata;
						field.filePreview = picturePreview as any;
						if (teacher.picture) {
							field.value = [teacher.picture, metadata];
						}
					} else if (key === "cv") {
						const metadata = { teacher_id: teacher.id, type: "cv" };
						field.metadata = metadata;
						field.filePreview = cvPreview as any;
						if (teacher.cv) {
							field.value = [teacher.cv, metadata];
						}
					} else if (key in teacher) {
						//@ts-ignore
						field.value = teacher[key];
					}
				})
				.omit(["id"])
				.getInputs(),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Καθηγητή",
			...modifyModal,
		};
	});
};

import type {
	ClassType,
	Teachers as FullTeachers,
	Instruments,
	Locations,
	TeacherClasses,
	TeacherInstruments,
	TeacherLocations,
} from "@_types/entities";
import { useAPI } from "@hooks/useAPI.solid";
import { FileHandler, FileProxy } from "@lib/fileHandling.client";
import { Random } from "@lib/random";
import { API } from "@routes/index.client";
import { sleep } from "@utilities/sleep";
import { type Props as InputProps } from "../../../input/Input.solid";

export type TeachersMetadata = { teacher_id: number; type: "cv" | "picture" };

export type TeacherJoins = {
	teacherClasses: number[];
	teacherInstruments: number[];
	teacherLocations: number[];
	priorities: number[];
	registrations_number: string[];
};

export type APIHook = ReturnType<typeof useAPI>;

type ExtraInputs =
	| "teacherClasses"
	| "teacherLocations"
	| "teacherInstrumentsTraditional"
	| "teacherInstrumentsEuropean"
	| "priority_byz"
	| "priority_par"
	| "priority_eur"
	| "ae_byz"
	| "ae_par"
	| "ae_eur";
export const TeachersInputs = (
	class_types: ClassType[],
	locations: Locations[],
	instruments: Instruments[],
	teacher?: FullTeachers,
	classList?: TeacherClasses[],
	locationsList?: TeacherLocations[],
	instrumentsList?: TeacherInstruments[],
): Record<keyof FullTeachers | ExtraInputs, InputProps> => {
	const teacherClasses = classList?.filter((c) => c.teacher_id === teacher?.id) || [];
	const teacherPriorities = teacherClasses.map((c) => {
		return { priority: c.priority, class_id: c.class_id };
	});
	const teacherRegNumber = teacherClasses.map((c) => {
		return {
			registration_number: c.registration_number,
			class_id: c.class_id,
		};
	});
	const multiselectClasses = class_types?.map((ct) => {
		let c = teacherClasses && teacherClasses.find((t) => t.class_id === ct.id);
		return { value: ct.id, label: ct.name, selected: !!c };
	});

	const teacherLocations = locationsList?.filter((l) => l.teacher_id === teacher?.id) || [];
	const multiselectLocations = locations?.map((l) => {
		let c = teacherLocations && teacherLocations.find((t) => t.location_id === l.id);
		return { value: l.id, label: l.name, selected: !!c };
	});

	const teacherInstruments = instrumentsList?.filter((i) => i.teacher_id === teacher?.id) || [];

	const multiselectInstrumentsTraditional = instruments
		?.filter((i) => i.type === "par")
		.map((i) => {
			let c = teacherInstruments && teacherInstruments.find((t) => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	const multiselectInstrumentsEuropean = instruments
		?.filter((i) => i.type === "eur")
		.map((i) => {
			let c = teacherInstruments && teacherInstruments.find((t) => t.instrument_id === i.id);
			return { value: i.id, label: i.name, selected: !!c };
		});
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		fullname: {
			name: "fullname",
			label: "Ονοματεπώνυμο",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		amka: {
			name: "amka",
			label: "ΑΜΚΑ",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
		},
		email: {
			name: "email",
			label: "Email",
			type: "email",
			iconClasses: "fa-solid fa-envelope",
		},
		telephone: {
			name: "telephone",
			label: "Τηλέφωνο",
			type: "text",
			iconClasses: "fa-solid fa-phone",
		},
		gender: {
			name: "gender",
			label: "Φύλο",
			type: "multiselect",
			iconClasses: "fa-solid fa-venus-mars",
			multiselectOnce: true,
			multiselectList: [
				{ value: 0, label: "Άρρεν", selected: teacher?.gender === "M" },
				{ value: 1, label: "Θήλυ", selected: teacher?.gender === "F" },
			],
		},
		title: {
			name: "title",
			label: "Τίτλος",
			type: "multiselect",
			multiselectList: ["Καθηγητής", "Δάσκαλος", "Επιμελητής"].map((t, i) => {
				return {
					value: i,
					label: t,
					selected: teacher?.title === i,
				};
			}),
			multiselectOnce: true,
			iconClasses: "fa-solid fa-user-graduate",
		},
		ae_byz: {
			name: "ae-byz",
			label: "Αρ.Έγκρισης Βυζαντινής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 0)?.registration_number || "",
		},
		ae_par: {
			name: "ae-par",
			label: "Αρ.Έγκρισης Παραδοσιακής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 1)?.registration_number || "",
		},
		ae_eur: {
			name: "ae-eur",
			label: "Αρ.Έγκρισης Ευρωπαϊκής",
			type: "text",
			iconClasses: "fa-solid fa-id-card",
			value: teacherRegNumber.find((p) => p.class_id === 2)?.registration_number || "",
		},
		priority_byz: {
			name: "priority_byz",
			label: "Προτεραιότητα Βυζαντινής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 0)?.priority || "",
			minmax: [1, 1000],
		},
		priority_par: {
			name: "priority_par",
			label: "Προτεραιότητα Παραδοσιακής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 1)?.priority || "",
			minmax: [1, 1000],
		},
		priority_eur: {
			name: "priority_eur",
			label: "Προτεραιότητα Ευρωπαϊκής",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			value: teacherPriorities.find((p) => p.class_id === 2)?.priority || "",
			minmax: [1, 1000],
		},
		picture: {
			name: "picture",
			label: "Φωτογραφία",
			type: "file",
			iconClasses: "fa-regular fa-file-image",
			fileExtension: "image/*",
			value: teacher?.picture || undefined,
		},
		cv: {
			name: "cv",
			label: "Βιογραφικό",
			type: "file",
			iconClasses: "fa-solid fa-file-pdf",
			fileExtension: ".pdf",
			value: teacher?.cv || undefined,
		},
		linktree: {
			name: "linktree",
			label: "Σύνδεσμος",
			type: "text",
			iconClasses: "fa-solid fa-link",
		},
		visible: {
			name: "visible",
			label: "Εμφάνιση",
			type: "multiselect",
			iconClasses: "fa-solid fa-eye",
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!teacher?.visible },
				{ value: 0, label: "Όχι", selected: !teacher?.visible },
			],
			multiselectOnce: true,
		},
		online: {
			name: "online",
			label: "Ηλεκτρ. Μάθημα",
			type: "multiselect",
			iconClasses: "fa-solid fa-laptop",
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!teacher?.online },
				{ value: 0, label: "Όχι", selected: !teacher?.online },
			],
			multiselectOnce: true,
		},
		teacherLocations: {
			name: "teacherLocations",
			label: "Τοποθεσίες",
			type: "multiselect",
			iconClasses: "fa-solid fa-map-location-dot",
			multiselectList: multiselectLocations,
		},
		teacherClasses: {
			name: "teacherClasses",
			label: "Μαθήματα",
			type: "multiselect",
			iconClasses: "fa-solid fa-chalkboard-teacher",
			multiselectList: multiselectClasses,
		},
		teacherInstrumentsTraditional: {
			name: "teacherInstrumentsTraditional",
			label: "Παραδοσιακή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsTraditional,
		},
		teacherInstrumentsEuropean: {
			name: "teacherInstrumentsEuropean",
			label: "Ευρωπαϊκή Μουσική",
			type: "multiselect",
			iconClasses: "fa-solid fa-guitar",
			multiselectList: multiselectInstrumentsEuropean,
		},
	};
};

export const class_types = [
	{ id: 0, name: "Βυζαντινή Μουσική" },
	{ id: 1, name: "Παραδοσιακή Μουσική" },
	{ id: 2, name: "Ευρωπαϊκή Μουσική" },
];

export const fileUpload = async (fileHandler: FileHandler<TeachersMetadata>, apiHook: APIHook) => {
	const newFile = fileHandler.getNewFiles().at(0);
	if (!newFile) return;
	const id = newFile.getMetadata().teacher_id;
	return apiHook(API.Teachers.fileUpload, {
		RequestObject: await fileHandler.fileToBlob(0),
		UrlArgs: { id },
	});
};
export const fileDelete = (fileHandler: FileHandler<TeachersMetadata>, apiHook: APIHook) => {
	const deletedFile = fileHandler.getDeletedFiles().at(0);
	if (!deletedFile) {
		return;
	}
	// console.log("Deleting file: ", deletedFile);
	const { teacher_id, type } = deletedFile.getMetadata();
	return apiHook(API.Teachers.fileDelete, {
		RequestObject: {
			id: teacher_id,
			type: type,
		},
	});
};

export function picturePreview(file: FileProxy<TeachersMetadata>) {
	const id = Random.string(12, "hex");

	(async function () {
		await sleep(10);
		const src = !file.isProxy()
			? await file.toImageUrl()
			: `/kathigites/picture/${file.getName()}`;
		document.querySelector(`img[data-id="${id}"]`)?.setAttribute("src", src);
	})();

	return <img data-id={id} alt="Φωτογραφία" class="object-cover w-full overflow-hidden" />;
}
export function cvPreview(file: FileProxy<TeachersMetadata>) {
	const id = Random.string(12, "hex");

	(async function () {
		const src = await file.toImageUrl();
		const canvas = document.querySelector(`canvas[data-id="${id}"]`) as HTMLCanvasElement;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const img = new Image();
		img.onload = function () {
			// Set canvas size to match the container
			const rect = canvas.getBoundingClientRect();
			canvas.width = rect.width;
			canvas.height = rect.height;

			// Calculate scaled dimensions (0.85x scale)
			const scale = 0.6;
			const scaledWidth = img.width * scale;
			const scaledHeight = img.height * scale;

			// Calculate position to align to top-left corner
			const x = -50; // Left alignment
			const y = -50; // Top alignment

			// Clear canvas and draw scaled image
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
		};
		img.src = src;
	})();

	return <canvas data-id={id} class="w-full overflow-hidden" style="object-fit: cover;" />;
}

export const PREFIX = "teachers";
export const INSTRUMENTS_PREFIX = "instruments";

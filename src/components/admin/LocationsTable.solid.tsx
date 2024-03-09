import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { FileHandler } from "../../../lib/fileHandling.client";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { fileToBlob } from "../../../lib/utils.client";
import type { Locations } from "../../../types/entities";
import { Fill, Omit, getMultiSelect, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";

const PREFIX = "locations";

type LocationsTable = Omit<Locations, "telephones" | "link" | "map" | "youtube">;

const LocationsInputs = (location?: Locations): Record<keyof Locations, InputProps> => {
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		name: {
			name: "name",
			label: "Όνομα Παραρτήματος",
			type: "text",
			iconClasses: "fa-solid fa-school",
		},
		address: {
			name: "address",
			label: "Διεύθυνση",
			type: "text",
			iconClasses: "fa-solid fa-location-dot",
		},
		areacode: {
			name: "areacode",
			label: "Ταχ. Κώδικας",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		municipality: {
			name: "municipality",
			label: "Δήμος",
			type: "text",
			iconClasses: "fa-solid fa-tree-city",
		},
		manager: {
			name: "manager",
			label: "Υπεύθυνος",
			type: "text",
			iconClasses: "fa-solid fa-user",
		},
		email: {
			name: "email",
			label: "Email",
			type: "email",
			iconClasses: "fa-solid fa-envelope",
		},
		telephones: {
			name: "telephones",
			label: "Τηλέφωνο",
			type: "text",
			iconClasses: "fa-solid fa-phone",
		},
		priority: {
			name: "priority",
			label: "Προτεραιότητα",
			type: "number",
			iconClasses: "fa-solid fa-arrow-up-9-1",
			minmax: [0, 100],
		},
		image: {
			name: "image",
			label: "Εικόνα",
			type: "file",
			iconClasses: "fa-regular fa-file-image",
			fileExtension: "image/*",
			value: location?.image,
		},
		map: {
			name: "map",
			label: "Google Maps",
			type: "text",
			iconClasses: "fa-solid fa-map-location-dot",
			value: location?.map,
		},
		link: {
			name: "link",
			label: "Ιστοσελίδα",
			type: "text",
			iconClasses: "fa-solid fa-link",
			value: location?.link,
		},
		youtube: {
			name: "youtube",
			label: "Youtube",
			type: "text",
			iconClasses: "fa-brands fa-youtube",
			value: location?.youtube,
		},
		partner: {
			name: "partner",
			label: "Συνεργαζόμενο Σπουδαστήριο",
			type: "multiselect",
			iconClasses: "fa-solid fa-check",
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!location?.partner },
				{ value: 0, label: "Όχι", selected: !location?.partner },
			],
			multiselectOnce: true,
		},
	};
};

const locationsToTable = (locations: Locations[]): LocationsTable[] => {
	return locations.map((loc) => {
		const columns: any[] = Array(10).fill(null);
		columns[0] = loc.id;
		columns[1] = loc.name;
		columns[2] = loc.address;
		columns[3] = loc.areacode;
		columns[4] = loc.municipality;
		columns[5] = loc.priority;
		columns[6] = loc.manager;
		columns[7] = loc?.email;
		columns[8] = (loc.image && "/spoudastiria/" + loc.image) || undefined;
		columns[9] = !!loc.partner;
		return columns as unknown as LocationsTable;
	});
};

const columnNames: ColumnType<LocationsTable> = {
	id: { type: "number", name: "Id", size: 4 },
	name: { type: "string", name: "Τοποθεσία", size: 15 },
	address: { type: "string", name: "Διεύθυνση", size: 15 },
	areacode: { type: "number", name: "Ταχ. Κώδικας" },
	municipality: { type: "string", name: "Δήμος", size: 12 },
	priority: { type: "number", name: "Προτεραιότητα", size: 12 },
	manager: { type: "string", name: "Υπεύθυνος", size: 15 },
	email: { type: "string", name: "Email", size: 20 },
	image: { type: "link", name: "Φωτογραφία", size: 15 },
	partner: {
		type: "boolean",
		name: "Συνεργαζόμενο Σπουδαστήριο",
		size: 12,
	},
};

export default function LocationsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setLocationHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Locations.getById,
				destEndpoint: API.Locations.get,
			},
		],
	});
	useHydrate(() => {
		apiHook(API.Locations.get);
	});

	let shapedData = createMemo(() => {
		const locations = store[API.Locations.get];
		if (!locations) return [];
		return locations ? locationsToTable(locations) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: FormData) {
			const data: Omit<Locations, "id" | "image"> = {
				name: formData.get("name") as string,
				address: formData.get("address") as string,
				areacode: Number(formData.get("areacode")),
				municipality: formData.get("municipality") as string,
				manager: formData.get("manager") as string,
				email: formData.get("email") as string,
				telephones: formData.get("telephones") as string,
				priority: Number(formData.get("priority")),
				map: formData.get("map") as string,
				link: formData.get("link") as string,
				youtube: formData.get("youtube") as string,
				partner: getMultiSelect("partner").map((i) => Number(i.dataset.value) as 0 | 1)[0],
			};
			const res = await apiHook(API.Locations.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			const id = res.data.insertId;
			const files = FileHandler.getFiles(PREFIX + ActionEnum.ADD + "image");
			const imgBlob =
				files.length && !files[0].isProxy ? await fileToBlob(files[0].file) : null;
			if (imgBlob) {
				await apiHook(API.Locations.fileUpload, {
					RequestObject: imgBlob,
					UrlArgs: { id },
				});
			}
			setLocationHydrate({ action: ActionEnum.ADD, id });
			pushAlert(createAlert("success", `Το παράρτημα ${data.name} προστέθηκε επιτυχώς!`));
		};
		return {
			inputs: Omit(LocationsInputs(), "id"),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Παραρτήματος",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};

		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length !== 1) return modifyModal;
		const location = locations.find((p) => p.id === selectedItems[0]);
		if (!location) return modifyModal;

		const submit = async function (formData: FormData) {
			const data: Omit<Locations, "image"> = {
				id: location.id,
				name: formData.get("name") as string,
				address: formData.get("address") as string,
				areacode: Number(formData.get("areacode")),
				municipality: formData.get("municipality") as string,
				manager: formData.get("manager") as string,
				email: formData.get("email") as string,
				telephones: formData.get("telephones") as string,
				priority: Number(formData.get("priority")),
				map: formData.get("map") as string,
				link: formData.get("link") as string,
				youtube: formData.get("youtube") as string,
				partner: getMultiSelect("partner").map((i) => Number(i.dataset.value) as 0 | 1)[0],
			};
			const res = await apiHook(API.Locations.update, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			const imgHandler = FileHandler.getHandler(PREFIX + ActionEnum.MODIFY + "image");
			const files = imgHandler.getFiles();
			const imgBlob =
				files.length && !files[0].isProxy ? await fileToBlob(files[0].file) : null;
			const deletedImg = imgHandler.getDeletedFiles();
			if (imgBlob) {
				await apiHook(API.Locations.fileUpload, {
					RequestObject: imgBlob,
					UrlArgs: { id: location.id },
				});
			} else if (deletedImg.length) {
				await apiHook(API.Locations.fileDelete, {
					UrlArgs: { id: location.id },
				});
			}

			setLocationHydrate({
				action: ActionEnum.MODIFY,
				id: location.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", `Το παράρτημα ${data.name} ενημερώθηκε επιτυχώς!`));
		};
		return {
			inputs: Omit(Fill(LocationsInputs(location), location), "id"),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Παραρτήματος",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length < 1) return deleteModal;
		const submit = async function () {
			const data = selectedItems.slice();
			const res = await apiHook(API.Locations.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setLocationHydrate({ action: ActionEnum.DELETE, ids: data });
			if (data.length === 1) {
				pushAlert(createAlert("success", `Το παράρτημα διαγράφηκε επιτυχώς!`));
			} else {
				pushAlert(
					createAlert("success", `Διαγράφηκαν επιτυχώς ${data.length} παραρτήματα!`)
				);
			}
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Παραρτήματος",
			...deleteModal,
		};
	});

	return (
		<Show when={store[API.Locations.get]} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
				<TableControlsGroup prefix={PREFIX}>
					<TableControl action={onAdd} prefix={PREFIX} />
					<TableControl action={onModify} prefix={PREFIX} />
					<TableControl action={onDelete} prefix={PREFIX} />
				</TableControlsGroup>
			</Table>
		</Show>
	);
}

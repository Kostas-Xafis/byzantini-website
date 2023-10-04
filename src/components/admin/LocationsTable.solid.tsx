import {
	API,
	type APIStore,
	useHydrate,
	useAPI,
} from "../../../lib/hooks/useAPI.solid";
import type { Locations } from "../../../types/entities";
import Table, { type ColumnType } from "./table/Table.solid";
import { createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, {
	ActionEnum,
	type Action,
	type EmptyAction,
	ActionIcon,
} from "./table/TableControls.solid";
import { type Props as InputProps, Fill, Omit } from "../Input.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { fileToBlob } from "../../../lib/utils.client";

const PREFIX = "locations";

type LocationsTable = Omit<
	Locations,
	"telephones" | "link" | "map" | "youtube"
>;

const LocationsInputs = (
	location?: Locations
): Record<keyof Locations, InputProps> => {
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
	return locations.map((p) => {
		let location = JSON.parse(JSON.stringify(p)) as Locations;
		// @ts-ignore
		delete location.telephones;
		// @ts-ignore
		delete location?.link;
		// @ts-ignore
		delete location.map;
		// @ts-ignore
		delete location?.youtube;

		const columns = Object.values(location) as (
			| string
			| number
			| boolean
		)[];
		//@ts-ignore
		columns[8] =
			(location.image && "/spoudastiria/" + location.image) || "";
		columns[9] = !!location.partner;
		return columns as unknown as LocationsTable;
	});
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function LocationsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Locations.getById,
		API.Locations.get
	);
	useHydrate(() => {
		useAPI(setStore, API.Locations.get, {});
	})(true);

	const columnNames: ColumnType<LocationsTable> = {
		id: { type: "number", name: "Id" },
		name: { type: "string", name: "Όνομα Παραρτήματος", size: 15 },
		address: { type: "string", name: "Διεύθυνση", size: 15 },
		areacode: { type: "number", name: "Ταχ. Κώδικας" },
		municipality: { type: "string", name: "Δήμος", size: 12 },
		manager: { type: "string", name: "Υπεύθυνος", size: 15 },
		email: { type: "string", name: "Email", size: 25 },
		priority: { type: "number", name: "Προτεραιότητα" },
		image: { type: "link", name: "Φωτογραφία", size: 15 },
		partner: {
			type: "boolean",
			name: "Συνεργαζόμενο Σπουδαστήριο",
			size: 10,
		},
	};

	let shapedData = createMemo(() => {
		const locations = store[API.Locations.get];
		if (!locations) return [];
		return locations ? locationsToTable(locations) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
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
				partner: [
					...document.querySelectorAll<HTMLInputElement>(
						`button[data-specifier='partner'][data-selected='true']`
					),
				].map((i) => Number(i.dataset.value) as 0 | 1)[0],
			};
			const res = await useAPI(setStore, API.Locations.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			const id = res.data.insertId;
			const files = {
				image: await fileToBlob(formData.get("image") as File),
			};
			if (files.image)
				await useAPI(setStore, API.Locations.fileUpload, {
					RequestObject: files.image,
					UrlArgs: { id },
				});
			setActionPressed({ action: ActionEnum.ADD, mutate: [id] });
		});
		return {
			inputs: Omit(LocationsInputs(), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Παραρτήματος",
			icon: ActionIcon.ADD,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length !== 1)
			return { icon: ActionIcon.MODIFY };
		const location = locations.find((p) => p.id === selectedItems[0]);
		if (!location) return { icon: ActionIcon.MODIFY };
		let imageRemoved = false;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
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
				partner: [
					...document.querySelectorAll<HTMLInputElement>(
						`button[data-specifier='partner'][data-selected='true']`
					),
				].map((i) => Number(i.dataset.value) as 0 | 1)[0],
			};
			const res = await useAPI(setStore, API.Locations.update, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			const file = {
				image: await fileToBlob(formData.get("image") as File),
			};
			if (imageRemoved) {
				await useAPI(setStore, API.Locations.fileDelete, {
					UrlArgs: { id: location.id },
				});
			}
			if (file.image)
				await useAPI(setStore, API.Locations.fileUpload, {
					RequestObject: file.image,
					UrlArgs: { id: location.id },
				});
			setActionPressed({
				action: ActionEnum.MODIFY,
				mutate: [location.id],
			});
		});
		const emptyFileRemove = (e: CustomEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const name = e.detail as string;
			if (name === location.image) imageRemoved = true;
		};

		const simpleTeacher = JSON.parse(JSON.stringify(location)) as Locations;
		// @ts-ignore
		delete simpleTeacher.image;
		// @ts-ignore
		delete simpleTeacher.cv;
		return {
			inputs: Omit(Fill(LocationsInputs(location), simpleTeacher), "id"),
			onMount: () => {
				//@ts-ignore
				document.addEventListener("emptyFileRemove", emptyFileRemove);
				formListener(submit, true, PREFIX);
			},
			onCleanup: () => {
				//@ts-ignore
				document.removeEventListener(
					"emptyFileRemove",
					emptyFileRemove
				);
				formListener(submit, false, PREFIX);
			},
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Παραρτήματος",
			icon: ActionIcon.MODIFY,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length < 1)
			return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();

			const data = selectedItems.slice();
			const res = await useAPI(setStore, API.Locations.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setActionPressed({ action: ActionEnum.DELETE, mutate: data });
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Παραρτήματος",
			icon: ActionIcon.DELETE,
		};
	});

	return (
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={store[API.Locations.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onAdd, onModify, onDelete]}
						prefix={PREFIX}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

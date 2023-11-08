import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import {
	API,
	useAPI,
	useHydrate,
	type APIStore,
} from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { fileToBlob } from "../../../lib/utils.client";
import type { Locations } from "../../../types/entities";
import {
	Fill,
	Omit,
	type Props as InputProps,
	getMultiSelect,
} from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import {
	ActionEnum,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControlTypes";
import TableControls, { type Action } from "./table/TableControls.solid";

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
		let location = JSON.parse(JSON.stringify(p)) as Partial<Locations>;
		delete location.telephones;
		delete location?.link;
		delete location.map;
		delete location?.youtube;

		const columns = Object.values(location) as (
			| string
			| number
			| boolean
		)[];
		columns[8] =
			(location.image && "/spoudastiria/" + location.image) || "";
		columns[9] = !!location.partner;
		return columns as unknown as LocationsTable;
	});
};

const [selectedItems, setSelectedItems] = useSelectedRows();

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

export default function LocationsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Locations.getById,
		API.Locations.get
	);
	useHydrate(() => {
		useAPI(API.Locations.get, {}, setStore);
	});

	let shapedData = createMemo(() => {
		const locations = store[API.Locations.get];
		if (!locations) return [];
		return locations ? locationsToTable(locations) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
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
				partner: getMultiSelect("partner").map(
					(i) => Number(i.dataset.value) as 0 | 1
				)[0],
			};
			const res = await useAPI(
				API.Locations.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			const id = res.data.insertId;
			const files = {
				image: await fileToBlob(formData.get("image") as File),
			};
			if (files.image)
				await useAPI(
					API.Locations.fileUpload,
					{
						RequestObject: files.image,
						UrlArgs: { id },
					},
					setStore
				);
			setActionPressed({ action: ActionEnum.ADD, mutate: [id] });
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

		let imageRemoved = false;
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
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
				partner: getMultiSelect("partner").map(
					(i) => Number(i.dataset.value) as 0 | 1
				)[0],
			};
			const res = await useAPI(
				API.Locations.update,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			const file = {
				image: await fileToBlob(formData.get("image") as File),
			};
			if (imageRemoved) {
				await useAPI(
					API.Locations.fileDelete,
					{
						UrlArgs: { id: location.id },
					},
					setStore
				);
			}
			if (file.image)
				await useAPI(
					API.Locations.fileUpload,
					{
						RequestObject: file.image,
						UrlArgs: { id: location.id },
					},
					setStore
				);
			setActionPressed({
				action: ActionEnum.MODIFY,
				mutate: [location.id],
			});
		};
		const emptyFileRemove = (e: CustomEvent<string>) => {
			e.preventDefault();
			e.stopPropagation();
			const name = e.detail;
			if (name === location.image) imageRemoved = true;
		};

		return {
			inputs: Omit(Fill(LocationsInputs(location), location), "id"),
			onSubmit: async (form: HTMLFormElement) => {
				document.addEventListener("emptyFileRemove", emptyFileRemove);
				submit(form);
			},
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
		const submit = async function (form: HTMLFormElement) {
			const data = selectedItems.slice();
			const res = await useAPI(
				API.Locations.delete,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({ action: ActionEnum.DELETE, mutate: data });
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

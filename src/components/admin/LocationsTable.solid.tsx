import { API, type APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Locations } from "../../../types/entities";
import Table, { type ColumnType } from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum, type Action, type EmptyAction, ActionIcon } from "./table/TableControls.solid";
import { type Props as InputProps, Fill, Omit } from "../Input.solid";
import { type ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "locations";

type LocationsTable = Omit<Locations, "telephones" | "link" | "map" | "youtube">;

const LocationsInputs = (location?: Locations): Record<keyof Locations, InputProps> => {
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		name: { name: "name", label: "Όνομα Παραρτήματος", type: "text", iconClasses: "fa-solid fa-school" },
		address: { name: "address", label: "Διεύθυνση", type: "text", iconClasses: "fa-solid fa-location-dot" },
		areacode: { name: "areacode", label: "Ταχ. Κώδικας", type: "number", iconClasses: "fa-solid fa-hashtag" },
		municipality: { name: "municipality", label: "Δήμος", type: "text", iconClasses: "fa-solid fa-tree-city" },
		manager: { name: "manager", label: "Υπεύθυνος", type: "text", iconClasses: "fa-solid fa-user" },
		email: { name: "email", label: "Email", type: "email", iconClasses: "fa-solid fa-envelope" },
		telephones: { name: "telephones", label: "Τηλέφωνο", type: "text", iconClasses: "fa-solid fa-phone" },
		priority: { name: "priority", label: "Προτεραιότητα", type: "number", iconClasses: "fa-solid fa-arrow-up-9-1", minmax: [0, 100] },
		image: {
			name: "image",
			label: "Εικόνα",
			type: "file",
			iconClasses: "fa-regular fa-file-image",
			fileExtension: "image/*",
			value: location?.image
		},
		map: { name: "map", label: "Google Maps", type: "text", iconClasses: "fa-solid fa-map-location-dot", value: location?.map },
		link: { name: "link", label: "Ιστοσελίδα", type: "text", iconClasses: "fa-solid fa-link", value: location?.link },
		youtube: { name: "youtube", label: "Youtube", type: "text", iconClasses: "fa-brands fa-youtube", value: location?.youtube }
	};
};

const locationToTableLocation = (location: Locations): LocationsTable => {
	// @ts-ignore
	delete location.telephones;
	// @ts-ignore
	delete location?.link;
	// @ts-ignore
	delete location.map;
	// @ts-ignore
	delete location?.youtube;

	const columns = Object.values(location);
	//@ts-ignore
	columns[8] = (location.image && "/spoudastiria/" + location.image) || "";
	return columns as unknown as LocationsTable;
};

const locationsToTable = (locations: Locations[]): LocationsTable[] => {
	return locations.map(p => locationToTableLocation(JSON.parse(JSON.stringify(p))));
};

const fileToBlob = async (file: File): Promise<Blob | null> => {
	if (!file.name) return null;
	return new Promise(res => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result) res(new Blob([reader.result], { type: file.type }));
			else res(null);
		};
		reader.readAsArrayBuffer(file);
	});
};

export default function LocationsTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		useAPI(setStore, API.Locations.get, {});
	});

	createEffect(
		on(actionPressed, action => {
			if (action === ActionEnum.NONE) return;
			ROWS[1].removeAll();
			hydrate(true);
		})
	);

	const [selectedItems, setSelectedItems] = createStore<number[]>([]);
	const ROWS = [
		selectedItems,
		{
			add: (id: number) => {
				setSelectedItems([...selectedItems, id]);
			},
			remove: (id: number) => {
				setSelectedItems(selectedItems.filter(i => i !== id));
			},
			removeAll: () => {
				setSelectedItems([]);
			}
		}
	] as const;
	const columnNames: ColumnType<LocationsTable> = {
		id: { type: "number", name: "Id" },
		name: { type: "string", name: "Όνομα Παραρτήματος", size: () => 15 },
		address: { type: "string", name: "Διεύθυνση", size: () => 15 },
		areacode: { type: "number", name: "Ταχ. Κώδικας" },
		municipality: { type: "string", name: "Δήμος", size: () => 12 },
		manager: { type: "string", name: "Υπεύθυνος", size: () => 15 },
		email: { type: "string", name: "Email", size: () => 25 },
		priority: { type: "number", name: "Προτεραιότητα" },
		image: { type: "link", name: "Φωτογραφία", size: () => 15 }
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
				youtube: formData.get("youtube") as string
			};
			const res = await useAPI(setStore, API.Locations.post, { RequestObject: data });
			if (!res.data) return;
			const id = res.data.insertId;
			const files = {
				image: await fileToBlob(formData.get("image") as File)
			};
			if (files.image)
				await useAPI(setStore, API.Locations.fileUpload, {
					RequestObject: files.image,
					UrlArgs: { id }
				});
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: Omit(LocationsInputs(), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Παραρτήματος",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length !== 1) return { icon: ActionIcon.MODIFY };
		const location = locations.find(p => p.id === selectedItems[0]);
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
				youtube: formData.get("youtube") as string
			};
			const res = await useAPI(setStore, API.Locations.update, { RequestObject: data });
			if (!res.data && !res.message) return;
			const file = {
				image: await fileToBlob(formData.get("image") as File)
			};
			if (imageRemoved) {
				await useAPI(setStore, API.Locations.fileDelete, {
					RequestObject: {
						id: location.id
					}
				});
			}
			if (file.image)
				await useAPI(setStore, API.Locations.fileUpload, {
					RequestObject: file.image,
					UrlArgs: { id: location.id }
				});
			setActionPressed(ActionEnum.MODIFY);
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
				document.removeEventListener("emptyFileRemove", emptyFileRemove);
				formListener(submit, false, PREFIX);
			},
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Παραρτήματος",
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const locations = store[API.Locations.get];
		if (!locations || selectedItems.length < 1) return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (locations.find(p => p.id === i) as Locations).id);
			const res = await useAPI(setStore, API.Locations.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Παραρτήματος",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Locations.get]} fallback={<Spinner />}>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls pressedAction={actionPressed} onActionsArray={[onAdd, onModify, onDelete]} prefix={PREFIX} />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

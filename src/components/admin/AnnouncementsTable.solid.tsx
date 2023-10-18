import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { FileHandler } from "../../../lib/fileHandling.client";
import {
	API,
	useAPI,
	useHydrate,
	type APIStore,
} from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { asyncQueue, fileToBlob } from "../../../lib/utils.client";
import type { Announcements } from "../../../types/entities";
import { Omit, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import {
	ActionEnum,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControlTypes";
import TableControls, { type Action } from "./table/TableControls.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";

const PREFIX = "announcements";

type AnnouncementTable = Omit<Announcements, "content">;

const AnnouncementsInputs = (): Omit<
	Record<keyof Announcements | "images", InputProps>,
	"views"
> => {
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		title: {
			name: "title",
			label: "Τίτλος",
			type: "text",
			iconClasses: "fa-solid fa-heading",
		},
		date: {
			name: "date",
			label: "Ημερομηνία",
			type: "date",
			iconClasses: "fa-solid fa-calendar",
		},
		content: {
			type: "textarea",
			name: "content",
			label: "Περιεχόμενο",
			iconClasses: "fa-solid fa-paragraph",
		},
		images: {
			type: "multifile",
			name: "photos",
			label: "Φωτογραφίες",
			iconClasses: "fa-solid fa-images",
			fileExtension: "image/*",
		},
	};
};

const announcementsToTable = (
	announcements: Announcements[]
): AnnouncementTable[] => {
	return announcements.map((a) => {
		let announcement = JSON.parse(
			JSON.stringify(a)
		) as Partial<Announcements>;
		delete announcement.content;
		const columns = Object.values(announcement);

		return columns as unknown as AnnouncementTable;
	});
};

const columnNames: ColumnType<AnnouncementTable> = {
	id: { type: "number", name: "Id" },
	title: { type: "string", name: "Τίτλος", size: 16 },
	date: { type: "date", name: "Ημερομηνία", size: 12 },
	views: { type: "number", name: "Προβολές" },
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function AnnouncementsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Announcements.getById,
		API.Announcements.get
	);
	useHydrate(() => {
		useAPI(API.Announcements.get, {}, setStore);
	})(true);

	let shapedData = createMemo(() => {
		const announcements = store[API.Announcements.get];
		if (!announcements) return [];
		return announcementsToTable(announcements);
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Announcements, "id" | "views"> = {
				title: formData.get("title") as string,
				content: formData.get("content") as string,
				date: new Date(formData.get("date") as string).getTime(),
			};
			const res = await useAPI(
				API.Announcements.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			const id = res.data.insertId;
			const photos = FileHandler.getFiles("photos").map((file, i) => {
				return async function () {
					let blob = await fileToBlob(file);
					if (!blob) {
						console.error("Could not load file:", file.name);
						return;
					}
					try {
						await useAPI(
							API.Announcements.postImage,
							{
								RequestObject: {
									announcement_id: id,
									name: file.name,
									priority: i + 1,
								},
							},
							setStore
						);
						await useAPI(
							API.Announcements.imageUpload,
							{
								RequestObject: blob,
								UrlArgs: { id, name: file.name },
							},
							setStore
						);
					} catch (e) {
						console.error(e);
					}
				};
			});
			await asyncQueue(photos, 2, true);
			setActionPressed({ action: ActionEnum.ADD, mutate: [id] });
		});
		return {
			inputs: Omit(AnnouncementsInputs(), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Ανακοίνωσης",
			icon: ActionIcon.ADD,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const announcements = store[API.Announcements.get];
		if (!announcements || selectedItems.length < 1)
			return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();

			const data = selectedItems.slice();
			const res = await useAPI(
				API.Announcements.delete,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({ action: ActionEnum.DELETE, mutate: data });
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Ανακοίνωσης",
			icon: ActionIcon.DELETE,
		};
	});

	return (
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={store[API.Announcements.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onAdd, onDelete]}
						prefix={PREFIX}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

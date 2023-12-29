import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { FileHandler } from "../../../lib/fileHandling.client";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { asyncQueue, fileToBlob } from "../../../lib/utils.client";
import type { Announcements } from "../../../types/entities";
import { Omit, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { ThumbnailGenerator } from "./ThumbnailGenerator";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";

const PREFIX = "announcements";

type AnnouncementTable = Omit<Announcements, "content"> & { link: string };

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

const announcementsToTable = (announcements: Announcements[]): AnnouncementTable[] => {
	return announcements.map((a) => {
		let announcement = JSON.parse(JSON.stringify(a)) as Partial<Announcements>;
		delete announcement.content;
		const columns = Object.values(announcement);
		columns.push(a.views);
		columns[3] = `/anakoinoseis/${a.title.replace(/ /g, "-")}`;
		return columns as unknown as AnnouncementTable;
	});
};

const columnNames: ColumnType<AnnouncementTable> = {
	id: { type: "number", name: "Id" },
	title: { type: "string", name: "Τίτλος", size: 16 },
	date: { type: "date", name: "Ημερομηνία", size: 12 },
	link: { type: "link", name: "Σελίδα" },
	views: { type: "number", name: "Προβολές" },
};

export default function AnnouncementsTable() {
	const [selectedItems, setSelectedItems] = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setAnnouncementHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Announcements.getById,
				destEndpoint: API.Announcements.get,
			},
		],
	});
	useHydrate(() => {
		apiHook(API.Announcements.get);
	});

	let shapedData = createMemo(() => {
		const announcements = store[API.Announcements.get];
		if (!announcements) return [];
		return announcementsToTable(announcements);
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: FormData) {
			const data: Omit<Announcements, "id" | "views"> = {
				title: formData.get("title") as string,
				content: formData.get("content") as string,
				date: new Date(formData.get("date") as string).getTime(),
			};
			if (data.title.includes("/"))
				return alert('Ο τίτλος δεν μπορεί να περιέχει τον χαρακτήρα "/"');
			const res = await apiHook(API.Announcements.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			const id = res.data.insertId;
			await ThumbnailGenerator.loadCompressor();

			const kb40 = 1024 * 40;
			const thumbCreator = new ThumbnailGenerator();
			const photos = FileHandler.getFiles("photos").map(({ isProxy, name, file }, i) => {
				if (isProxy) return async () => {};
				return async function () {
					let blob = await fileToBlob(file);
					if (!blob) return console.error("Could not load file:", name);
					try {
						await apiHook(API.Announcements.postImage, {
							RequestObject: {
								announcement_id: id,
								name,
								priority: i + 1,
							},
						});
						await apiHook(API.Announcements.imageUpload, {
							RequestObject: blob,
							UrlArgs: { id, name },
						});
						if (file.size <= kb40) {
							await apiHook(API.Announcements.imageUpload, {
								RequestObject: blob,
								UrlArgs: {
									id,
									name: "thumb_" + name,
								},
							});
							return;
						}
						const thumbBlob = await fileToBlob(
							await thumbCreator.createThumbnail(file, name)
						);
						if (!thumbBlob) throw new Error("Could not create thumbnail");
						await apiHook(API.Announcements.imageUpload, {
							RequestObject: thumbBlob,
							UrlArgs: { id, name: "thumb_" + name },
						});
					} catch (e) {
						console.error(e);
					}
				};
			});
			await asyncQueue(photos, 4, true);
			setAnnouncementHydrate({ action: ActionEnum.ADD, ids: [id] });
		};
		return {
			inputs: Omit(AnnouncementsInputs(), "id"),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Ανακοίνωσης",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const announcements = store[API.Announcements.get];
		if (!announcements || selectedItems.length < 1) return deleteModal;
		const submit = async function () {
			const data = selectedItems.slice();
			const res = await apiHook(API.Announcements.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setAnnouncementHydrate({ action: ActionEnum.DELETE, ids: data });
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Ανακοίνωσης",
			...deleteModal,
		};
	});

	return (
		<SelectedItemsContext.Provider value={[selectedItems, setSelectedItems]}>
			<Show
				when={store[API.Announcements.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

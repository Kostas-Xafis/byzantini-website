import { Show, createMemo } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { FileHandler } from "../../../lib/fileHandling.client";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { asyncQueue, deepCopy, fileToBlob, isSafeURLPath } from "../../../lib/utils.client";
import type { AnnouncementImages, Announcements } from "../../../types/entities";
import { Fill, Omit, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert, updateAlert } from "./Alert.solid";
import { ThumbnailGenerator } from "./ThumbnailGenerator";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";

const PREFIX = "announcements";

type SimpleAnnouncements = Omit<Announcements, "image_counter">;

type AnnouncementTable = Omit<Announcements, "content" | "image_counter"> & { link: string };

const AnnouncementsInputs = (): Omit<
	Record<keyof Announcements | "images" | "mainImage", InputProps>,
	"views" | "image_counter"
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
			iconClasses: "fa-solid fa-calendar-days",
		},
		content: {
			type: "textarea",
			name: "content",
			label: "Περιεχόμενο",
			iconClasses: "fa-solid fa-paragraph",
		},
		mainImage: {
			type: "file",
			name: "mainImage",
			label: "Κεντρική Φωτογραφία",
			iconClasses: "fa-solid fa-image",
			fileExtension: "image/*",
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
		let announcement = deepCopy(a) as Partial<Announcements>;
		delete announcement.content;
		delete announcement.image_counter;
		const columns = Object.values(announcement);
		columns.push(a.views);
		columns[3] = `/anakoinoseis/${a.title.replace(/ /g, "-")}`;
		return columns as unknown as AnnouncementTable;
	});
};

const columnNames: ColumnType<AnnouncementTable> = {
	id: { type: "number", name: "Id" },
	title: { type: "string", name: "Τίτλος", size: 24 },
	date: { type: "date", name: "Ημερομηνία", size: 12 },
	link: { type: "link", name: "Σελίδα" },
	views: { type: "number", name: "Προβολές" },
};

function assertNotNull<T>(value: T): asserts value is NonNullable<typeof value> {}
async function UploadImages(args: {
	announcement_id: number;
	setStore: SetStoreFunction<APIStore>;
	fileHandler: FileHandler;
	images?: AnnouncementImages[]; // Include images only when modifying
	is_main?: boolean;
}) {
	const { announcement_id, fileHandler, images, is_main = false } = args;
	const apiHook = useAPI(args.setStore);
	await ThumbnailGenerator.loadCompressor();

	const kb40 = 1024 * 40;
	const thumbCreator = new ThumbnailGenerator();

	const photos = fileHandler
		.getFiles()
		.filter((f) => !f.isProxy)
		.map(({ name, file }, i) => {
			assertNotNull(file);
			return async function () {
				let blob = await fileToBlob(file);
				if (!blob)
					return pushAlert(
						createAlert("error", `Σφάλμα κατά το ανέβασμα της φωτογραφίας ${name}`)
					);
				try {
					await apiHook(API.Announcements.postImage, {
						RequestObject: {
							announcement_id,
							name,
							is_main,
						},
					});
					await apiHook(API.Announcements.imageUpload, {
						RequestObject: blob,
						UrlArgs: { id: announcement_id, name },
					});
					if (file.size <= kb40) {
						await apiHook(API.Announcements.imageUpload, {
							RequestObject: blob,
							UrlArgs: {
								id: announcement_id,
								name: "thumb_" + name,
							},
						});
						return;
					}
					const thumbBlob = await fileToBlob(
						await thumbCreator.createThumbnail(file, name, i === 0 ? 0.2 : undefined)
					);
					if (!thumbBlob) throw new Error("Could not create thumbnail");
					await apiHook(API.Announcements.imageUpload, {
						RequestObject: thumbBlob,
						UrlArgs: { id: announcement_id, name: "thumb_" + name },
					});
				} catch (e) {
					pushAlert(
						createAlert("error", `Σφάλμα κατά το ανέβασμα της φωτογραφίας ${name}`)
					);
				}
			};
		});
	if (photos.length !== 0) {
		const photosLength = photos.length;
		const alert = pushAlert(createAlert("success", "Ανέβασμα φωτογραφιών: 0 / ", photosLength));
		await asyncQueue(photos, {
			maxJobs: 4,
			verbose: true,
			progressCallback: (i) => {
				alert.message = `Ανέβασμα φωτογραφιών: ${i} / ${photosLength}`;
				updateAlert(alert);
			},
		});
	}

	if (!images) return;
	const deletedFiles = fileHandler.getDeletedFiles();
	if (deletedFiles.length === 0) return;

	let ids = images
		.filter((img) => img.announcement_id === announcement_id)
		?.map((img) => (deletedFiles.find((f) => f.name === img.name) ? img.id : undefined))
		.filter((id) => id !== undefined) as number[];
	if (ids.length === 0) return;

	// Remove the marked files from the handler
	ids.forEach((id) => {
		fileHandler.removeFile(id, true);
	});

	await apiHook(API.Announcements.imagesDelete, {
		RequestObject: ids,
		UrlArgs: { announcement_id },
	});
}

export default function AnnouncementsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setAnnouncementHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Announcements.getById,
				destEndpoint: API.Announcements.get,
			},
			{
				srcEndpoint: API.Announcements.getImagesById,
				destEndpoint: API.Announcements.getImages,
				foreignKey: "announcement_id",
			},
		],
	});
	useHydrate(() => {
		apiHook(API.Announcements.get);
		apiHook(API.Announcements.getImages);
	});

	let shapedData = createMemo(() => {
		const announcements = store[API.Announcements.get];
		if (!announcements) return [];
		return announcementsToTable(announcements);
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: FormData) {
			if (!isSafeURLPath(formData.get("title") as string)) {
				alert("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό");
				throw new Error("Invalid title");
			}
			const data: Omit<SimpleAnnouncements, "id" | "views"> = {
				title: formData.get("title") as string,
				content: formData.get("content") as string,
				date: new Date(formData.get("date") as string).getTime(),
			};
			const res = await apiHook(API.Announcements.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			const id = res.data.insertId;

			await UploadImages({
				announcement_id: id,
				setStore,
				fileHandler: FileHandler.getHandler(PREFIX + ActionEnum.ADD + "mainImage"),
				is_main: true,
			});

			await UploadImages({
				announcement_id: id,
				setStore,
				fileHandler: FileHandler.getHandler(PREFIX + ActionEnum.ADD + "photos"),
			});
			setAnnouncementHydrate({ action: ActionEnum.ADD, id });
			pushAlert(createAlert("success", "Η ανακοίνωση προστέθηκε επιτυχώς"));
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
	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const announcements = store[API.Announcements.get];
		const images = store[API.Announcements.getImages];
		if (!announcements || !images || selectedItems.length !== 1) return modifyModal;

		const submit = async function (formData: FormData) {
			if (!isSafeURLPath(formData.get("title") as string)) {
				alert("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό");
				throw new Error("Invalid title");
			}

			const data: Omit<SimpleAnnouncements, "views"> = {
				id: selectedItems[0],
				title: formData.get("title") as string,
				content: formData.get("content") as string,
				date: new Date(formData.get("date") as string).getTime(),
			};
			const res = await apiHook(API.Announcements.update, {
				RequestObject: data,
			});
			if (!res.message) return;

			await UploadImages({
				announcement_id: data.id,
				setStore,
				fileHandler: FileHandler.getHandler(PREFIX + ActionEnum.MODIFY + "mainImage"),
				is_main: true,
			});

			await UploadImages({
				announcement_id: data.id,
				setStore,
				fileHandler: FileHandler.getHandler(PREFIX + ActionEnum.MODIFY + "photos"),
				images,
			});

			setAnnouncementHydrate({ action: ActionEnum.MODIFY, id: data.id, isMultiple: false });
			pushAlert(createAlert("success", "Η ανακοίνωση ενημερώθηκε επιτυχώς"));
		};
		const anc = announcements.find((a) => a.id === selectedItems[0]);
		const copyAnc = deepCopy(anc) as unknown as Record<
			keyof ReturnType<typeof AnnouncementsInputs>,
			any
		>;
		// @ts-ignore
		delete copyAnc.views;
		copyAnc.mainImage = images.find((i) => i.is_main)?.name;
		copyAnc.images = images
			.filter((i) => i.announcement_id === copyAnc.id && !i.is_main)
			.map((i) => i.name);
		return {
			inputs: Fill(AnnouncementsInputs(), copyAnc),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Ανακοίνωσης",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const announcements = store[API.Announcements.get];
		if (!announcements || selectedItems.length < 1) return deleteModal;
		const data = selectedItems.slice();
		const submit = async function () {
			const res = await apiHook(API.Announcements.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setAnnouncementHydrate({ action: ActionEnum.DELETE, ids: data });
			if (data.length === 1) {
				pushAlert(createAlert("success", "Η ανακοίνωση διαγράφηκε επιτυχώς"));
				return;
			}
			pushAlert(createAlert("success", `Διαγραφθηκαν επιτυχώς ${data.length} ανακοινώσεις`));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: data.length === 1 ? "Διαγραφή Ανακοίνωσης" : "Διαγραφή Ανακοινώσεων",
			...deleteModal,
		};
	});

	return (
		<Show
			when={store[API.Announcements.get]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
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

import { isUploadImageType } from "@lib/bucket/publicFiles";
import type { AnnouncementImages, Announcements } from "@_types/entities";
import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useCacheMutations } from "@hooks/useCacheMutations.solid";
import { SelectedRows } from "@hooks/useSelectedRows.solid";
import { filePreviewImage } from "@components/input/filePreview";
import { FileHandler, type FileProxy } from "@lib/fileHandling.client";
import { API } from "@routes/index.client";
import { asyncQueue } from "@utilities/AsyncQueue";
import { ExtendedFormData } from "@utilities/forms";
import { deepCopy } from "@utilities/objects";
import { isSafeURLPath } from "@utilities/url";
import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert, toast } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";
import { useTableSearch } from "./table/useTableSearch.solid";

const PREFIX = "announcements";

type AnnouncementTable = Omit<Announcements, "content" | "links"> & { link: string };

const AnnouncementsInputs = (): Omit<Record<keyof Announcements | "images" | "mainImage" | "links", InputProps>, "views"> => {
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			icon: "hash",
		},
		title: {
			name: "title",
			label: "Τίτλος",
			type: "text",
			icon: "heading",
		},
		date: {
			name: "date",
			label: "Ημερομηνία",
			type: "date",
			icon: "calendar",
		},
		content: {
			type: "textarea",
			name: "content",
			label: "Περιεχόμενο",
			icon: "paragraph",
		},
		mainImage: {
			type: "file",
			name: "mainImage",
			label: "Κεντρική Φωτογραφία",
			icon: "image",
			fileExtension: "image/*",
		},
		links: {
			type: "textarea",
			name: "links",
			label: "Σύνδεσμοι YouTube",
			icon: "youtube",
			placeholder: "https://youtube.com/watch?v=...\nhttps://youtu.be/...\n.\n.\n.",
		},
		images: {
			type: "multifile",
			name: "photos",
			label: "Φωτογραφίες",
			icon: "images",
			fileExtension: "image/*",
		},
	};
};

const announcementsToTable = (announcements: Announcements[]): AnnouncementTable[] => {
	return announcements.map((a) => {
		let announcement = deepCopy(a) as Partial<Announcements>;
		delete announcement.content;
		delete announcement.links;
		const columns = Object.values(announcement);
		columns.push(a.views);
		columns[3] = `/sxoli/anakoinoseis/${a.title.replaceAll(" ", "%20")}`;

		return columns as unknown as AnnouncementTable;
	});
};

const columnNames: ColumnType<AnnouncementTable> = {
	id: { type: "number", name: "Id" },
	title: { type: "string", name: "Τίτλος", size: 48 },
	date: { type: "date", name: "Ημερομηνία", size: 12 },
	link: { type: "link", name: "Σελίδα" },
	views: { type: "number", name: "Προβολές" },
};

function assertNotNull<T>(value: T): asserts value is NonNullable<typeof value> {}

function imagePreview(file: FileProxy<AnnouncementImageMetadata>) {
	return filePreviewImage(file, (f) => `/anakoinoseis/images/${f.getMetadata().announcement_id}/thumb_${f.getName()}`);
}

type AnnouncementImageMetadata = { is_main: boolean; announcement_id: number; id: number };
export default function AnnouncementsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIResourceStore>({});
	const apiHook = useAPIClient(setStore);
	const setAnnouncementHydrate = useCacheMutations({
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
	createAPIResource(API.Announcements.get, undefined, { cache: setStore });
	createAPIResource(API.Announcements.getImages, undefined, { cache: setStore });

	/** Uploads the handler's new files; resolves to the names that failed (their stored namesakes must stay). */
	async function imagesUpload(fileHandler: FileHandler<AnnouncementImageMetadata>): Promise<Set<string>> {
		const photos = fileHandler.getNewFiles();
		const failedNames = new Set<string>();
		if (photos.length === 0) return failedNames;
		let failed = 0;
		const uploadQueue = photos.map((fileProxy) => {
			assertNotNull(fileProxy);
			return async function () {
				const file = fileProxy.getFile();
				if (!file) return;
				const metadata = fileProxy.getMetadata();
				const name = fileProxy.getName();
				const { type: fileType } = file;
				if (!isUploadImageType(fileType)) {
					failed++;
					failedNames.add(name);
					pushAlert(createAlert("error", `Μη υποστηριζόμενος τύπος αρχείου: ${name} (μόνο JPG, PNG, WebP ή GIF)`));
					return;
				}
				try {
					await apiHook(API.Announcements.postImage, {
						RequestObject: {
							announcement_id: metadata.announcement_id,
							name,
							is_main: metadata.is_main,
							fileType,
							fileData: file,
						},
					});
				} catch (e) {
					console.error(e);
					failed++;
					failedNames.add(name);
					pushAlert(createAlert("error", `Σφάλμα κατά το ανέβασμα της φωτογραφίας: ${name}`));
				}
			};
		});
		if (photos.length !== 0) {
			const total = photos.length;
			const progress = toast.progress({ title: "Ανέβασμα φωτογραφιών", done: 0, total });
			await asyncQueue(uploadQueue, {
				maxJobs: 4,
				verbose: true,
				onProgress: ({ done }) => progress.update({ done, total }),
			});
			// Failed photos already got their own error toast.
			if (failed === 0) progress.success(total === 1 ? "Η φωτογραφία ανέβηκε." : `Ανέβηκαν και οι ${total} φωτογραφίες.`);
			else if (failed < total) progress.warning(`Ανέβηκαν ${total - failed} από ${total} φωτογραφίες.`);
			else progress.dismiss();
		}
		return failedNames;
	}

	/**
	 * Deletes the stored photos the user removed or replaced — called AFTER the uploads, so a replacement never leaves
	 * the announcement without its photo: a replaced main image is not even listed (`getRemovedFiles`; Announcements.
	 * postImage swaps the main row itself), and a photo whose same-named replacement failed to upload (`keep`) stays.
	 */
	async function imagesDelete(fileHandler: FileHandler<AnnouncementImageMetadata>, keep: Set<string> = new Set()) {
		const deletedFiles = fileHandler.getRemovedFiles().filter((f) => !keep.has(f.getName()));

		if (deletedFiles.length === 0) return;

		const ids = deletedFiles.map((f) => f.getMetadata().id);
		fileHandler.removeDeletedFiles();

		// Remove the marked files from the handler
		await apiHook(API.Announcements.imagesDelete, {
			RequestObject: ids,
			UrlArgs: { announcement_id: fileHandler.getMetadata().announcement_id },
		});
	}

	const baseRows = createMemo(() => {
		const announcements = store[API.Announcements.get];
		if (!announcements) return [];
		return announcementsToTable(announcements);
	});
	const { shapedData, searchQuery, setSearchQuery, searchColumns, resultsCount, totalCount, searchToIndex, onQueryChange } = useTableSearch(
		baseRows,
		Object.values(columnNames).map(({ name, type }) => ({ name, type })),
	);
	const onAdd = createMemo((): Action | EmptyAction => {
		const metadata = { is_main: true };
		const submit = async function (f: ExtendedFormData<Announcements>) {
			if (!isSafeURLPath(f.string("title"))) {
				toast.warning("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό", { title: "Μη έγκυρος τίτλος" });
				throw new Error("Invalid title");
			}
			const data: Omit<Announcements, "id" | "views"> & { links: string } = {
				title: f.string("title") as string,
				content: f.string("content") as string,
				date: f.date("date").getTime(),
				links: f
					.string("links")
					.split("\n")
					.map((l) => l.trim())
					.join("|"),
			};
			const res = await apiHook(API.Announcements.post, {
				RequestObject: data,
			});
			if (!("data" in res) || !res.data) return;
			const id = res.data.insertId;
			const mainImageHandler = FileHandler.getHandler<AnnouncementImageMetadata>(PREFIX + ActionEnum.ADD + "mainImage");
			const imagesHandler = FileHandler.getHandler<AnnouncementImageMetadata>(PREFIX + ActionEnum.ADD + "photos");

			mainImageHandler.setMetadata({ is_main: true, announcement_id: id, id: 0 });
			imagesHandler.setMetadata({ is_main: false, announcement_id: id, id: 0 });
			await Promise.all([imagesUpload(mainImageHandler), imagesUpload(imagesHandler)]);

			setAnnouncementHydrate({ action: ActionEnum.ADD, id });
			pushAlert(createAlert("success", "Η ανακοίνωση προστέθηκε επιτυχώς"));
		};
		return {
			inputs: new InputFields(AnnouncementsInputs())
				.omit(["id"])
				.fill((field, key) => {
					if (key === "mainImage") {
						field.metadata = metadata;
					}
					if (key === "images") {
						field.metadata = { is_main: false };
					}
					if (key === "mainImage" || key === "images") {
						field.filePreview = imagePreview as any;
					}
				})
				.getInputs(),
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
		const submit = async function (f: ExtendedFormData<Announcements>) {
			if (!isSafeURLPath(f.string("title"))) {
				toast.warning("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό", { title: "Μη έγκυρος τίτλος" });
				throw new Error("Invalid title");
			}
			const announcement_id = selectedItems[0];
			const data: Omit<Announcements, "views"> = {
				id: announcement_id,
				title: f.string("title"),
				content: f.string("content"),
				date: f.date("date").getTime(),
				links: f
					.string("links")
					.split("\n")
					.map((l) => l.trim())
					.filter((l) => l.length > 0)
					.join("|"),
			};
			const res = await apiHook(API.Announcements.update, { RequestObject: data });
			if (!("message" in res) || !res.message) return;

			const mainImageHandler = FileHandler.getHandler<AnnouncementImageMetadata>(PREFIX + ActionEnum.MODIFY + "mainImage");
			const photosHandler = FileHandler.getHandler<AnnouncementImageMetadata>(PREFIX + ActionEnum.MODIFY + "photos");

			// Upload first, delete after: a failed upload keeps the stored photo it was meant to replace.
			const [mainFailed, photosFailed] = await Promise.all([imagesUpload(mainImageHandler), imagesUpload(photosHandler)]);
			await Promise.all([imagesDelete(mainImageHandler, mainFailed), imagesDelete(photosHandler, photosFailed)]);
			setAnnouncementHydrate({ action: ActionEnum.MODIFY, id: data.id, isMultiple: false });
			pushAlert(createAlert("success", "Η ανακοίνωση ενημερώθηκε επιτυχώς"));
		};
		const announcement = announcements.find((a) => a.id === selectedItems[0]) as Announcements;
		const mainImage = images.find((i) => i.is_main && i.announcement_id === announcement.id) as AnnouncementImages;
		return {
			inputs: new InputFields(AnnouncementsInputs())
				.fill((field, key) => {
					const announcId = announcement.id;
					if (key === "mainImage") {
						if (mainImage) {
							field.value = [
								mainImage.name,
								{
									is_main: true,
									announcement_id: announcId,
									id: mainImage.id,
								},
							];
						}
						field.metadata = { is_main: true, announcement_id: announcId };
					} else if (key === "images") {
						field.value = images
							.filter((i) => i.announcement_id === announcId && !i.is_main)
							.map(({ name, id, announcement_id }) => [name, { is_main: false, announcement_id, id }]) as any;
						field.metadata = {
							is_main: false,
							announcement_id: announcId,
							id: 0,
						};
					} else if (key === "links") {
						field.value = announcement.links.replaceAll("|", "\n");
					} else field.value = announcement[key];
					if (key === "mainImage" || key === "images") {
						field.filePreview = imagePreview as any;
					}
				})
				.getInputs(),
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
			if (!("data" in res ? res.data : res.message)) return;
			setAnnouncementHydrate({ action: ActionEnum.DELETE, ids: data });
			if (data.length === 1) {
				pushAlert(createAlert("success", "Η ανακοίνωση διαγράφηκε επιτυχώς"));
				return;
			}
			pushAlert(createAlert("success", `Διαγράφηκαν επιτυχώς ${data.length} ανακοινώσεις`));
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
		<Show when={store[API.Announcements.get]} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table
				prefix={PREFIX}
				data={shapedData}
				columns={columnNames}
				structure={[
					{
						position: "top",
						prefix: PREFIX,
						controlGroups: [
							{
								controls: [onAdd, onModify, onDelete],
							},
							{
								type: "search",
								columns: searchColumns,
								searchQuery,
								setSearchQuery,
								resultsCount,
								totalCount,
								searchToIndex,
								onQueryChange,
							},
						],
					},
				]}
			/>
		</Show>
	);
}

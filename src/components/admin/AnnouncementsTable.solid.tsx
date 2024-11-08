import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { FileHandler } from "../../../lib/fileHandling.client";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import { ExtendedFormData, asyncQueue, deepCopy, isSafeURLPath } from "../../../lib/utils.client";
import type { AnnouncementImages, Announcements } from "../../../types/entities";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert, updateAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";

const PREFIX = "announcements";

type AnnouncementTable = Omit<Announcements, "content" | "links"> & { link: string };

const AnnouncementsInputs = (): Omit<
	Record<keyof Announcements | "images" | "mainImage" | "links", InputProps>,
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
		links: {
			type: "textarea",
			name: "links",
			label: "Συνδέσμοι Youtube",
			iconClasses: "fa-brands fa-youtube",
			placeholder: "https://youtube.com/watch?v=...\nhttps://youtu.be/...\n.\n.\n.",
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
		delete announcement.links;
		const columns = Object.values(announcement);
		columns.push(a.views);
		columns[3] = `/sxoli/anakoinoseis/${a.title.replaceAll(" ", "%20")}`;

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

type AnnouncementImageMetadata = { is_main: boolean; announcement_id: number; id: number };
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

	async function imagesUpload(fileHandler: FileHandler<AnnouncementImageMetadata>) {
		const kb40 = 1024 * 40;

		const photos = fileHandler.getNewFiles();
		if (photos.length === 0) return;
		const uploadQueue = photos.map(({ name, file, metadata }) => {
			assertNotNull(file);
			return async function () {
				const { type: fileType } = file;
				try {
					let thumbFile: File | Blob = file;
					if (file.size > kb40) {
						thumbFile = await (
							await fetch(import.meta.env.VITE_IMG_COMPRESSION_SERVICE_URL, {
								method: "POST",
								body: await file.arrayBuffer(),
							})
						).blob();
					}
					if (!thumbFile) throw new Error("Could not create thumbnail");
					await apiHook(API.Announcements.postImage, {
						RequestObject: {
							announcement_id: metadata.announcement_id,
							name,
							is_main: metadata.is_main,
							fileType,
							fileData: file,
							thumbData: thumbFile,
						},
					});
				} catch (e) {
					console.error(e);
					pushAlert(
						createAlert("error", `Σφάλμα κατά το ανέβασμα της φωτογραφίας: ${name}`)
					);
				}
			};
		});
		if (photos.length !== 0) {
			const photosLength = photos.length;
			const alert = pushAlert(
				createAlert("success", "Ανέβασμα φωτογραφιών: 0 / ", photosLength)
			);
			await asyncQueue(uploadQueue, {
				maxJobs: 4,
				verbose: true,
				progressCallback: (i) => {
					alert.message = `Ανέβασμα φωτογραφιών: ${i} / ${photosLength}`;
					updateAlert(alert);
				},
			});
		}
	}

	async function imagesDelete(fileHandler: FileHandler<AnnouncementImageMetadata>) {
		const deletedFiles = fileHandler.getDeletedFiles();

		if (deletedFiles.length === 0) return;

		const ids = deletedFiles.map((f) => f.metadata.id);
		fileHandler.removeDeletedFiles();

		// Remove the marked files from the handler
		await apiHook(API.Announcements.imagesDelete, {
			RequestObject: ids,
			UrlArgs: { announcement_id: fileHandler.getMetadata().announcement_id },
		});
	}

	let shapedData = createMemo(() => {
		const announcements = store[API.Announcements.get];
		if (!announcements) return [];
		return announcementsToTable(announcements);
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const metadata = { is_main: true };
		const submit = async function (form: ExtendedFormData<Announcements>) {
			if (!isSafeURLPath(form.string("title"))) {
				alert("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό");
				throw new Error("Invalid title");
			}
			const data: Omit<Announcements, "id" | "views"> & { links: string } = {
				title: form.string("title") as string,
				content: form.string("content") as string,
				date: form.date("date").getTime(),
				links: form
					.string("links")
					.split("\n")
					.map((l) => l.trim())
					.join("|"),
			};
			const res = await apiHook(API.Announcements.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			const id = res.data.insertId;
			const mainImageHandler = FileHandler.getHandler<AnnouncementImageMetadata>(
				PREFIX + ActionEnum.ADD + "mainImage"
			);
			const imagesHandler = FileHandler.getHandler<AnnouncementImageMetadata>(
				PREFIX + ActionEnum.ADD + "photos"
			);

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
		const submit = async function (form: ExtendedFormData<Announcements>) {
			if (!isSafeURLPath(form.string("title"))) {
				alert("Οι ειδικοί χαρακτήρες που επιτρέπονται είναι: .'$_.+!*()- και το κενό");
				throw new Error("Invalid title");
			}
			const announcement_id = selectedItems[0];
			const data: Omit<Announcements, "views"> = {
				id: announcement_id,
				title: form.string("title"),
				content: form.string("content"),
				date: form.date("date").getTime(),
				links: form
					.string("links")
					.split("\n")
					.map((l) => l.trim())
					.filter((l) => l.length > 0)
					.join("|"),
			};
			const res = await apiHook(API.Announcements.update, { RequestObject: data });
			if (!res.message) return;

			const mainImageHandler = FileHandler.getHandler<AnnouncementImageMetadata>(
				PREFIX + ActionEnum.MODIFY + "mainImage"
			);
			const photosHandler = FileHandler.getHandler<AnnouncementImageMetadata>(
				PREFIX + ActionEnum.MODIFY + "photos"
			);

			await Promise.all([imagesDelete(mainImageHandler), imagesDelete(photosHandler)]);

			await Promise.all([imagesUpload(mainImageHandler), imagesUpload(photosHandler)]);
			setAnnouncementHydrate({ action: ActionEnum.MODIFY, id: data.id, isMultiple: false });
			pushAlert(createAlert("success", "Η ανακοίνωση ενημερώθηκε επιτυχώς"));
		};
		const announcement = announcements.find((a) => a.id === selectedItems[0]) as Announcements;
		const mainImage = images.find(
			(i) => i.is_main && i.announcement_id === announcement.id
		) as AnnouncementImages;
		return {
			inputs: new InputFields(AnnouncementsInputs())
				.fill((field, key) => {
					if (key === "mainImage") {
						field.value = [
							mainImage.name,
							{
								is_main: true,
								announcement_id: announcement.id,
								id: mainImage.id,
							},
						];
						field.metadata = {
							is_main: true,
							announcement_id: announcement.id,
						};
					} else if (key === "images") {
						field.value = images
							.filter((i) => i.announcement_id === announcement.id && !i.is_main)
							.map(({ name, id, announcement_id }) => [
								name,
								{ is_main: false, announcement_id, id },
							]) as any;
						field.metadata = {
							is_main: false,
							announcement_id: announcement.id,
							id: 0,
						};
					} else if (key === "links") {
						field.value = announcement.links.replaceAll("|", "\n");
					} else field.value = announcement[key];
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
						],
					},
				]}
			/>
		</Show>
	);
}

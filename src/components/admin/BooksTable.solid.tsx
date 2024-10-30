import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import type { ExtendedFormData } from "../../../lib/utils.client";
import type { Books, Wholesalers } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import { Fill, Omit, Pick, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";

const PREFIX = "books";

type BooksTable = ReplaceName<Books, "wholesaler_id", "wholesaler"> & {
	reserved: number;
};

const BooksInputs = (wholesalers: Wholesalers[]): Record<keyof Books, InputProps> => {
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
			iconClasses: "fa-solid fa-book",
		},
		wholesaler_id: {
			name: "wholesaler_id",
			label: "Χονδρέμπορος",
			type: "select",
			iconClasses: "fa-solid fa-feather",
			selectList: wholesalers.map((w) => w.name),
			valueList: wholesalers.map((w) => w.id),
		},
		wholesale_price: {
			name: "wholesale_price",
			label: "Χονδρική Τιμή",
			type: "number",
			iconClasses: "fa-solid fa-euro-sign",
		},
		price: {
			name: "price",
			label: "Λιανική Τιμή",
			type: "number",
			iconClasses: "fa-solid fa-shop",
		},
		quantity: {
			name: "quantity",
			label: "Ποσότητα",
			type: "number",
			iconClasses: "fa-solid fa-boxes",
		},
		sold: {
			name: "sold",
			label: "Πωλήσεις",
			type: "number",
			iconClasses: "fa-solid fa-money-bills",
		},
	};
};

const booksToTable = (books: Books[], wholesalers: Wholesalers[]): BooksTable[] => {
	return books.map((book) => {
		const columns = Object.values(book) as any[];
		columns[2] = wholesalers.find((w) => w.id === book.wholesaler_id)?.name;
		columns[3] = columns[3] + "€";
		columns[4] = columns[4] + "€";

		columns.push(columns[5] - columns[6]);
		return columns as unknown as BooksTable;
	});
};

const columnNames: ColumnType<BooksTable> = {
	id: { type: "number", name: "Id", size: 4 },
	title: { type: "string", name: "Τίτλος", size: 15 },
	wholesaler: { type: "string", name: "Χονδρέμπορος", size: 15 },
	wholesale_price: {
		type: "string",
		name: "Χονδρική Τιμή",
	},
	price: { type: "string", name: "Λιανική Τιμή" },
	quantity: { type: "number", name: "Ποσότητα" },
	sold: { type: "number", name: "Πωλήσεις" },
	reserved: { type: "number", name: "Απόθεμα" },
};

export default function BooksTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setBookHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Books.getById,
				destEndpoint: API.Books.get,
			},
		],
	});
	const setWholesalerHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Wholesalers.getById,
				destEndpoint: API.Wholesalers.get,
			},
		],
	});

	useHydrate(() => {
		apiHook(API.Books.get);
		apiHook(API.Wholesalers.get);
	});

	let shapedData = createMemo(() => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!books || !wholesalers) return [];
		return books && wholesalers ? booksToTable(books, wholesalers) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const addModal = {
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
		const wholesalers = store["Wholesalers.get"];
		if (!wholesalers) {
			return addModal;
		}
		const submit = async function (form: ExtendedFormData<Books>) {
			const data: Omit<Books, "id"> = {
				title: form.string("title"),
				wholesaler_id: form.number("wholesaler_id"),
				wholesale_price: form.number("wholesale_price"),
				price: form.number("price"),
				quantity: form.number("quantity"),
				sold: form.number("sold"),
			};
			if (data.wholesale_price > data.price)
				return alert("Η χονδρική τιμή πρέπει να είναι μικρότερη από την λιανική");
			if (data.quantity < data.sold)
				return alert(
					"Οι πωλήσεις δεν μπορούν να είναι περισσοτερες από την ποσότητα των βιβλίων"
				);
			const res = await apiHook(API.Books.post, {
				RequestObject: data,
			});
			if (!res.data) return;
			setBookHydrate({
				action: ActionEnum.ADD,
				id: res.data.insertId,
			});
			pushAlert(createAlert("success", "Επιτυχής προσθήκη βιβλίου: " + (data.title || "")));
		};
		return {
			inputs: Omit(BooksInputs(wholesalers), "id"),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Βιβλίου",
			...addModal,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books || selectedItems.length !== 1) return modifyModal;
		const book = books.find((b) => b.id === selectedItems[0]) as Books;
		const submit = async function (formData: ExtendedFormData<Books>) {
			const data: Pick<Books, "id" | "quantity"> = {
				id: book.id,
				quantity: formData.number("quantity"),
			};
			const res = await apiHook(API.Books.updateQuantity, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setBookHydrate({ action: ActionEnum.MODIFY, id: book.id, isMultiple: false });
			pushAlert(createAlert("success", "Επιτυχής ενημέρωση βιβλίου: " + (book.title || "")));
		};
		return {
			inputs: Pick(Fill(BooksInputs(wholesalers), book), "quantity"),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Ποσότητας",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};

		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books || selectedItems.length < 1) return deleteModal;
		const submit = async function () {
			const data = selectedItems.map((id) => books.find((b) => b.id === id)?.id || -1);
			const res = await apiHook(API.Books.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setBookHydrate({
				action: ActionEnum.DELETE,
				ids: selectedItems.slice(),
			});
			data.forEach((id) => {
				let name = books.find((b) => b.id === id)?.title;
				pushAlert(createAlert("success", "Επιτυχής διαγραφή βιβλίου: " + (name || "")));
			});
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Βιβλίων",
			...deleteModal,
		};
	});

	const onAddWholesaler = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: ExtendedFormData<{ wholesaler_name: string }>) {
			const name = formData.string("wholesaler_name");
			const res = await apiHook(API.Wholesalers.post, { RequestObject: { name } });
			if (!res.data) return;
			setWholesalerHydrate({
				action: ActionEnum.ADD,
				id: res.data.insertId,
			});
			pushAlert(createAlert("success", "Επιτυχής προσθήκη χονδρέμπορου: " + (name || "")));
		};
		return {
			inputs: {
				name: {
					name: "wholesaler_name",
					label: "Όνομα",
					type: "text",
					iconClasses: "fa-solid fa-feather",
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Χονδρέμπορου",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_USER,
		};
	});
	const onDeleteWholesaler = createMemo((): Action | EmptyAction => {
		const wholesalers = store[API.Wholesalers.get] || [];
		const submit = async function (formData: ExtendedFormData<{ wholesaler_id: string }>) {
			const data = [formData.number("wholesaler_id")];
			const res = await apiHook(API.Wholesalers.delete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setWholesalerHydrate({
				action: ActionEnum.DELETE,
				ids: data,
			});
			let name = wholesalers.find((w) => w.id === data[0])?.name;
			pushAlert(createAlert("success", "Επιτυχής διαγραφή χονδρέμπορου: " + (name || "")));
		};
		return {
			inputs: {
				name: {
					name: "wholesaler_id",
					label: "Χονδρέμπορος",
					type: "select",
					iconClasses: "fa-solid fa-feather",
					selectList: wholesalers.map((w) => w.name),
					valueList: wholesalers.map((w) => w.id),
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Χονδρέμπορου",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER,
		};
	});

	return (
		<Show
			when={store[API.Books.get] && store[API.Wholesalers.get]}
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
							{ controls: [onAdd, onModify, onDelete] },
							{
								controls: [onAddWholesaler, onDeleteWholesaler],
								prefix: "wholesalers",
							},
						],
					},
				]}
			/>
		</Show>
	);
}

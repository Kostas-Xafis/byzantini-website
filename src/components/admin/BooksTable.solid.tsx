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
import type { Books, Wholesalers } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import {
	Fill,
	Omit,
	Pick,
	type Props as InputProps,
} from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import {
	ActionEnum,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControlTypes";
import {
	TableControl,
	type Action,
	TableControlsGroup,
} from "./table/TableControls.solid";

const PREFIX = "books";

type BooksTable = ReplaceName<Books, "wholesaler_id", "wholesaler"> & {
	reserved: number;
};

const BooksInputs = (
	wholesalers: Wholesalers[]
): Record<keyof Books, InputProps> => {
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
			name: "wholesaler",
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

const booksToTable = (
	books: Books[],
	wholesalers: Wholesalers[]
): BooksTable[] => {
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
	id: { type: "number", name: "Id" },
	title: { type: "string", name: "Τίτλος", size: 15 },
	wholesaler: { type: "string", name: "Χονδρέμπορος", size: 15 },
	wholesale_price: {
		type: "string",
		name: "Χονδρική Τιμή",
		size: 9,
	},
	price: { type: "string", name: "Λιανική Τιμή", size: 9 },
	quantity: { type: "number", name: "Ποσότητα" },
	sold: { type: "number", name: "Πωλήσεις" },
	reserved: { type: "number", name: "Απόθεμα" },
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function BooksTable() {
	const [store, setStore] = createStore<APIStore>({});
	const setBookHydrate = useHydrateById(setStore, [
		{
			srcEndpoint: API.Books.getById,
			destEndpoint: API.Books.get,
		},
	]);
	const setWholesalerHydrate = useHydrateById(setStore, [
		{
			srcEndpoint: API.Wholesalers.getById,
			destEndpoint: API.Wholesalers.get,
		},
	]);

	useHydrate(() => {
		useAPI(API.Books.get, {}, setStore);
		useAPI(API.Wholesalers.get, {}, setStore);
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
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data: Omit<Books, "id"> = {
				title: formData.get("title") as string,
				wholesaler_id: Number(formData.get("wholesaler")),
				wholesale_price: parseInt(
					formData.get("wholesale_price") as string
				),
				price: parseInt(formData.get("price") as string),
				quantity: parseInt(formData.get("quantity") as string),
				sold: parseInt(formData.get("sold") as string),
			};
			if (data.wholesale_price > data.price)
				return alert(
					"Η χονδρική τιμή πρέπει να είναι μικρότερη από την λιανική"
				);
			if (data.quantity < data.sold)
				return alert(
					"Οι πωλήσεις δεν μπορούν να είναι περισσοτερες από την ποσότητα των βιβλίων"
				);
			const res = await useAPI(
				API.Books.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			setBookHydrate({
				action: ActionEnum.ADD,
				ids: [res.data.insertId],
			});
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
		if (!wholesalers || !books || selectedItems.length !== 1)
			return modifyModal;
		const book = books.find((b) => b.id === selectedItems[0]) as Books;
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data: Pick<Books, "id" | "quantity"> = {
				id: book.id,
				quantity: Number(formData.get("quantity") as string),
			};
			const res = await useAPI(
				API.Books.updateQuantity,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setBookHydrate({ action: ActionEnum.MODIFY, ids: [book.id] });
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
		if (!wholesalers || !books || selectedItems.length < 1)
			return deleteModal;
		const submit = async function (form: HTMLFormElement) {
			const data = selectedItems.map(
				(id) => books.find((b) => b.id === id)?.id || -1
			);
			const res = await useAPI(
				API.Books.delete,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setBookHydrate({
				action: ActionEnum.DELETE,
				ids: selectedItems.slice(),
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
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data = {
				name: formData.get("name") as string,
			};
			const res = await useAPI(
				API.Wholesalers.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			setWholesalerHydrate({
				action: ActionEnum.ADD,
				ids: [res.data.insertId],
			});
		};
		return {
			inputs: {
				name: {
					name: "name",
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
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
			const data = [Number(formData.get("name"))];
			const res = await useAPI(
				API.Wholesalers.delete,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setWholesalerHydrate({
				action: ActionEnum.DELETE,
				ids: data,
			});
		};
		return {
			inputs: {
				name: {
					name: "name",
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
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={store[API.Books.get] && store[API.Wholesalers.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onModify} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl
							action={onAddWholesaler}
							prefix={"wholesalers"}
						/>
						<TableControl
							action={onDeleteWholesaler}
							prefix={"wholesalers"}
						/>
					</TableControlsGroup>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

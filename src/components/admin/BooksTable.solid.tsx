import { API, type APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Books, Wholesalers } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import Table, { type ColumnType } from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum, type Action, type EmptyAction, ActionIcon } from "./table/TableControls.solid";
import { Omit, type Props as InputProps, Pick, Fill } from "../Input.solid";
import { type ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "books";

type BooksTable = ReplaceName<Books, "wholesaler_id", "wholesaler"> & { reserved: number };

const BooksInputs = (wholesalers: Wholesalers[]): Record<keyof Books, InputProps> => {
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		title: { name: "title", label: "Τίτλος", type: "text", iconClasses: "fa-solid fa-book" },
		wholesaler_id: {
			name: "wholesaler",
			label: "Χονδρέμπορος",
			type: "select",
			iconClasses: "fa-solid fa-feather",
			selectList: wholesalers.map(w => w.name),
			valueList: wholesalers.map(w => w.id)
		},
		wholesale_price: {
			name: "wholesale_price",
			label: "Χονδρική Τιμή",
			type: "number",
			iconClasses: "fa-solid fa-euro-sign"
		},
		price: { name: "price", label: "Λιανική Τιμή", type: "number", iconClasses: "fa-solid fa-shop" },
		quantity: { name: "quantity", label: "Ποσότητα", type: "number", iconClasses: "fa-solid fa-boxes" },
		sold: { name: "sold", label: "Πωλήσεις", type: "number", iconClasses: "fa-solid fa-money-bills" }
	};
};

const bookToTableBook = (book: Books, wholesalers: Wholesalers[]): BooksTable => {
	const columns = Object.values(book);
	columns[2] = wholesalers.find(w => w.id === book.wholesaler_id)?.name || "";
	columns[3] = columns[3] + "€";
	columns[4] = columns[4] + "€";
	//@ts-ignore
	columns.push(columns[5] - columns[6]);
	return columns as unknown as BooksTable;
};

const booksToTable = (books: Books[], wholesalers: Wholesalers[]): BooksTable[] => {
	return books.map(book => bookToTableBook(book, wholesalers));
};

export default function BooksTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		useAPI(setStore, API.Books.get, {});
		useAPI(setStore, API.Wholesalers.get, {});
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
	const columnNames: ColumnType<BooksTable> = {
		id: { type: "number", name: "Id" },
		title: { type: "string", name: "Τίτλος", size: () => 15 },
		wholesaler: { type: "string", name: "Χονδρέμπορος", size: () => 15 },
		wholesale_price: { type: "number", name: "Χονδρική Τιμή", size: () => 9 },
		price: { type: "number", name: "Λιανική Τιμή", size: () => 9 },
		quantity: { type: "number", name: "Ποσότητα" },
		sold: { type: "number", name: "Πωλήσεις" },
		reserved: { type: "number", name: "Απόθεμα" }
	};

	let shapedData = createMemo(() => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!books || !wholesalers) return [];
		return books && wholesalers ? booksToTable(books, wholesalers) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const wholesalers = store["Wholesalers.get"];
		if (!wholesalers) return { icon: ActionIcon.ADD };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Books, "id"> = {
				title: formData.get("title") as string,
				wholesaler_id: Number(formData.get("wholesaler")),
				wholesale_price: parseInt(formData.get("wholesale_price") as string),
				price: parseInt(formData.get("price") as string),
				quantity: parseInt(formData.get("quantity") as string),
				sold: parseInt(formData.get("sold") as string)
			};
			if (data.wholesale_price > data.price) return alert("Η χονδρική τιμή πρέπει να είναι μικρότερη από την λιανική");
			if (data.quantity < data.sold) return alert("Οι πωλήσεις δεν μπορούν να είναι περισσοτερες από την ποσότητα των βιβλίων");
			const res = await useAPI(setStore, API.Books.post, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: Omit(BooksInputs(wholesalers), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Βιβλίου",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books) return { icon: ActionIcon.MODIFY };
		if (selectedItems.length !== 1) return { icon: ActionIcon.MODIFY };
		const book = books.find(b => b.id === selectedItems[0]) as Books;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Pick<Books, "id" | "quantity"> = {
				id: book.id,
				quantity: parseInt(formData.get("quantity") as string)
			};
			const res = await useAPI(setStore, API.Books.updateQuantity, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.MODIFY);
		});
		return {
			inputs: Pick(Fill(BooksInputs(wholesalers), book), "quantity"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Ποσότητας",
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books) return { icon: ActionIcon.DELETE };
		if (selectedItems.length < 1) return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(id => books.find(b => b.id === id)?.id || -1);
			const res = await useAPI(setStore, API.Books.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Βιβλίων",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE
		};
	});

	const onAddWholesaler = createMemo((): Action | EmptyAction => {
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data = {
				name: formData.get("name") as string
			};
			const res = await useAPI(setStore, API.Wholesalers.post, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: {
				name: { name: "name", label: "Όνομα", type: "text", iconClasses: "fa-solid fa-feather" } as InputProps
			},
			onMount: () => formListener(submit, true, "wholesalers"),
			onCleanup: () => formListener(submit, false, "wholesalers"),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Χονδρέμπορου",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_USER
		};
	});
	const onDeleteWholesaler = createMemo((): Action | EmptyAction => {
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers) return { icon: ActionIcon.DELETE_USER };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data = [Number(formData.get("name"))];
			const res = await useAPI(setStore, API.Wholesalers.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {
				name: {
					name: "name",
					label: "Χονδρέμπορος",
					type: "select",
					iconClasses: "fa-solid fa-feather",
					selectList: wholesalers.map(w => w.name),
					valueList: wholesalers.map(w => w.id)
				} as InputProps
			},
			onMount: () => formListener(submit, true, "wholesalers"),
			onCleanup: () => formListener(submit, false, "wholesalers"),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Χονδρέμπορου",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Books.get] && store[API.Wholesalers.get]} fallback={<Spinner />}>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls pressedAction={actionPressed} onActionsArray={[onAdd, onModify, onDelete]} prefix={PREFIX} />
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onAddWholesaler, onDeleteWholesaler]}
						prefix={"wholesalers"}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

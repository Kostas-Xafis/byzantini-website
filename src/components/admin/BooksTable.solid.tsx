import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Books, Wholesalers } from "../../../types/entities";
import type { Replace } from "../../../types/helpers";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum } from "./table/TableControls.solid";
import { Omit, type Props as InputProps, Pick, Fill } from "../Input.solid";
import { ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formListener } from "./table/formSubmit";

const PREFIX = "books";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type BooksTable = Replace<Books, "wholesaler_id", "wholesaler"> & { reserved: number };

const BooksInputs = (wholesalers: Wholesalers[]): Record<keyof Books, InputProps> => {
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		title: { name: "title", label: "Τίτλος", type: "text", iconClasses: "fa-solid fa-book" },
		wholesaler_id: {
			name: "wholesaler",
			label: "Χονδρέμπορος",
			type: "select",
			iconClasses: "fa-solid fa-feather",
			selectList: wholesalers.map(w => w.name)
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
	columns[2] = wholesalers[(columns[2] as number) - 1].name;
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
		console.log("Hydrating table data");
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
		id: "Id",
		title: { name: "Τίτλος", size: () => 20 },
		wholesaler: { name: "Χονδρέμπορος", size: () => 15 },
		wholesale_price: { name: "Χονδρική Τιμή", size: () => 9 },
		price: { name: "Λιανική Τιμή", size: () => 9 },
		quantity: "Ποσότητα",
		sold: "Πωλήσεις",
		reserved: "Απόθεμα"
	};

	let shapedData = createMemo(() => {
		console.log("Calling shapedData");
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!books || !wholesalers) return [];
		return books && wholesalers ? booksToTable(books, wholesalers) : [];
	});
	const onAdd = createMemo(() => {
		const wholesalers = store["Wholesalers.get"];
		if (!wholesalers) return undefined;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Books, "id"> = {
				title: formData.get("title") as string,
				wholesaler_id: wholesalers[parseInt(formData.get("wholesaler") as string)]?.id || -1,
				wholesale_price: parseInt(formData.get("wholesale_price") as string),
				price: parseInt(formData.get("price") as string),
				quantity: parseInt(formData.get("quantity") as string),
				sold: parseInt(formData.get("sold") as string)
			};
			if (data.wholesale_price >= data.price) return;
			useAPI(setStore, API.Books.post, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.ADD);
			});
		};
		return {
			inputs: Omit(BooksInputs(wholesalers), "id"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Βιβλίου",
			type: ActionEnum.ADD
		};
	});
	const onEdit = createMemo(() => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books) return undefined;
		if (selectedItems.length !== 1) return undefined;
		const book = books.find(b => b.id === selectedItems[0]) as Books;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Pick<Books, "id" | "quantity"> = {
				id: book.id,
				quantity: parseInt(formData.get("quantity") as string)
			};
			useAPI(setStore, API.Books.updateQuantity, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.EDIT);
			});
		};
		const filledInputs = Fill(BooksInputs(wholesalers), book);
		filledInputs.wholesaler_id.value = (filledInputs.wholesaler_id.value as number) - 1;
		return {
			inputs: Pick(filledInputs, "quantity"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση Ποσότητας",
			type: ActionEnum.EDIT
		};
	});
	const onDelete = createMemo(() => {
		const books = store[API.Books.get];
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers || !books) return undefined;
		if (selectedItems.length < 1) return undefined;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => books[i].id);
			useAPI(setStore, API.Books.delete, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.DELETE);
			});
		};
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Βιβλίων",
			type: ActionEnum.DELETE
		};
	});

	const onAddWholesaler = createMemo(() => {
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Wholesalers, "id"> = {
				name: formData.get("name") as string
			};
			useAPI(setStore, API.Wholesalers.post, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.ADD);
			});
		};
		return {
			inputs: {
				name: { name: "name", label: "Όνομα", type: "text", iconClasses: "fa-solid fa-feather" } as InputProps
			},
			onMount: () => formListener(submit, true, "wholesalers"),
			onCleanup: () => formListener(submit, false, "wholesalers"),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Χονδρέμπορου",
			type: ActionEnum.ADD
		};
	});
	const onDeleteWholesaler = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		if (!wholesalers) return undefined;
		const submit = function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data = [wholesalers[parseInt(formData.get("name") as string)]?.id || -1];
			useAPI(setStore, API.Wholesalers.delete, { RequestObject: data }).then(() => {
				setActionPressed(ActionEnum.DELETE);
			});
		};
		console.log(wholesalers.map(w => w.name));
		return {
			inputs: {
				name: {
					name: "name",
					label: "Χονδρέμπορος",
					type: "select",
					iconClasses: "fa-solid fa-feather",
					selectList: wholesalers.map(w => w.name)
				} as InputProps
			},
			onMount: () => formListener(submit, true, "wholesalers"),
			onCleanup: () => formListener(submit, false, "wholesalers"),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Χονδρέμπορου",
			type: ActionEnum.DELETE
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Books.get] && store[API.Wholesalers.get]} fallback={<div>Loading...</div>}>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls pressedAction={actionPressed} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} prefix={PREFIX} />
					<TableControls
						pressedAction={actionPressed}
						onAdd={onAddWholesaler}
						onDelete={onDeleteWholesaler}
						prefix={"wholesalers"}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

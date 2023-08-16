import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Books, Payments } from "../../../types/entities";
import type { Replace } from "../../../types/helpers";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum } from "./table/TableControls.solid";
import { type Props as InputProps, Pick, Fill } from "../Input.solid";
import { ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "payments";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type PaymentsTable = Replace<Payments, "book_id", "title">;

const PaymentsInputs = (books: Books[]): Record<keyof Payments, InputProps> => {
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		student_name: { name: "student_name", label: "Μαθητής", type: "text", iconClasses: "fa-solid fa-graduation-cap" },
		book_id: { name: "book_id", label: "Βιβλίο", type: "select", iconClasses: "fa-solid fa-book", selectList: books.map(b => b.title) },
		amount: {
			name: "amount",
			label: "Οφειλή",
			type: "number",
			iconClasses: "fa-solid fa-money-bills"
		},
		date: {
			name: "date",
			label: "Ημερομηνία",
			type: "date",
			value: Date.now(),
			iconClasses: "fa-regular fa-calendar-days"
		},
		payment_date: {
			name: "payment_date",
			label: "Ημερομηνία Πληρωμής",
			type: "date",
			iconClasses: "fa-regular fa-calendar-days"
		}
	};
};

const paymentToTablePayment = (payment: Payments, books: Books[]): PaymentsTable => {
	const columns = Object.values(payment);
	//@ts-ignore
	columns[2] = books.find(b => b.id === payment.book_id).title;
	let d = new Date(columns[4]);
	columns[3] = columns[3] + "€";
	//@ts-ignore
	columns[4] = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
	if (columns.length === 5) columns.push("-");
	else if (columns[5] === 0) {
		columns[5] = "-";
	} else {
		d = new Date(columns[5]);
		//@ts-ignore
		columns[5] = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
	}
	return columns as unknown as PaymentsTable;
};

const paymentsToTable = (payments: Payments[], books: Books[]): PaymentsTable[] => {
	return payments.map(p => paymentToTablePayment(p, books));
};

export default function PaymentsTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		console.log("Hydrating table data");
		useAPI(setStore, API.Payments.get, {});
		useAPI(setStore, API.Books.get, {});
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
	const columnNames: ColumnType<PaymentsTable> = {
		id: "Id",
		student_name: { name: "Μαθητής", size: () => 15 },
		title: { name: "Τίτλος", size: () => 25 },
		amount: "Οφειλή",
		date: "Ημερομηνία",
		payment_date: "Ημερομηνία Πληρωμής"
	};

	let shapedData = createMemo(() => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!books || !payments) return [];
		return books && payments ? paymentsToTable(payments, books) : [];
	});
	const onAdd = createMemo(() => {
		const books = store[API.Books.get];
		if (!books) return undefined;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Payments, "id" | "amount"> = {
				student_name: formData.get("student_name") as string,
				book_id: Number(formData.get("book_id") as string) + 1,
				date: new Date(formData.get("date") as string).getTime() / 1000,
				payment_date: formData.get("payment_date") ? new Date(formData.get("payment_date") as string).getTime() / 1000 : undefined
			};

			const res = await useAPI(setStore, API.Payments.post, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: Pick(PaymentsInputs(books), "book_id", "student_name", "date"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Πληρωμής",
			type: ActionEnum.ADD
		};
	});
	const onEdit = createMemo(() => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length !== 1) return undefined;
		const payment = payments.find(p => p.id === selectedItems[0]) as Payments;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Pick<Payments, "id" | "amount"> = {
				id: payment.id,
				amount: Number(formData.get("amount") as string)
			};
			if (data.amount > payment.amount || data.amount === 0) throw Error("Invalid amount");
			const res = await useAPI(setStore, API.Payments.updatePayment, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.EDIT);
		});
		const filledInputs = Fill(PaymentsInputs(books), payment);
		return {
			inputs: Pick(filledInputs, "amount"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: `Ενημέρωση πληρωμής`,
			type: ActionEnum.EDIT
		};
	});
	const onDelete = createMemo(() => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length < 1) return undefined;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (payments.find(p => p.id === i) as Payments).id);
			const res = await useAPI(setStore, API.Payments.complete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ολοκλήρωση",
			headerText: `Ολοκλήρωση πληρωμών`,
			type: ActionEnum.DELETE
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Books.get] && store[API.Payments.get]} fallback={<Spinner />}>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onAdd={onAdd}
						onEdit={onEdit}
						onDelete={onDelete}
						prefix={PREFIX}
						complete
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

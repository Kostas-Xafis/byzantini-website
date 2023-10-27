import {
	API,
	type APIStore,
	useHydrate,
	useAPI,
} from "../../../lib/hooks/useAPI.solid";
import type { Books, Payments } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import Table, { type ColumnType } from "./table/Table.solid";
import { createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	ActionEnum,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControlTypes";
import TableControls, { type Action } from "./table/TableControls.solid";
import { type Props as InputProps, Pick, Fill } from "../input/Input.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../other/Spinner.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";

const PREFIX = "payments";

type PaymentsTable = ReplaceName<Payments, "book_id", "title">;

const PaymentsInputs = (books: Books[]): Record<keyof Payments, InputProps> => {
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		student_name: {
			name: "student_name",
			label: "Μαθητής",
			type: "text",
			iconClasses: "fa-solid fa-graduation-cap",
		},
		book_id: {
			name: "book_id",
			label: "Βιβλίο",
			type: "select",
			iconClasses: "fa-solid fa-book",
			selectList: books.map((b) => b.title),
			valueList: books.map((b) => b.id),
		},
		amount: {
			name: "amount",
			label: "Οφειλή",
			type: "number",
			iconClasses: "fa-solid fa-money-bills",
		},
		book_amount: {
			name: "book_amount",
			label: "Ποσότητα",
			type: "number",
			iconClasses: "fa-solid fa-book",
		},
		date: {
			name: "date",
			label: "Ημερομηνία",
			type: "date",
			value: Date.now(),
			iconClasses: "fa-regular fa-calendar-days",
		},
		payment_date: {
			name: "payment_date",
			label: "Ημερομηνία Πληρωμής",
			type: "date",
			iconClasses: "fa-regular fa-calendar-days",
		},
	};
};

const paymentsToTable = (
	payments: Payments[],
	books: Books[]
): PaymentsTable[] => {
	return payments.map((p) => {
		const columns = Object.values(p);
		columns[2] =
			books.find((b) => b.id === p.book_id)?.title || "Δεν βρέθηκε!";
		columns[3] = columns[3] + "€";
		return columns as unknown as PaymentsTable;
	});
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function PaymentsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Payments.getById,
		API.Payments.get
	);
	useHydrate(() => {
		useAPI(API.Payments.get, {}, setStore);
		useAPI(API.Books.get, {}, setStore);
	});

	const columnNames: ColumnType<PaymentsTable> = {
		id: { type: "number", name: "Id" },
		student_name: { type: "string", name: "Μαθητής", size: 15 },
		title: { type: "string", name: "Βιβλίο", size: 25 },
		amount: { type: "number", name: "Οφειλή" },
		book_amount: { type: "number", name: "Ποσότητα" },
		date: { type: "date", name: "Ημερομηνία Παραλαβής" },
		payment_date: { type: "date", name: "Ημερομηνία Πληρωμής" },
	};

	let shapedData = createMemo(() => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!books || !payments) return [];
		return books && payments ? paymentsToTable(payments, books) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		if (!books) return { icon: ActionIcon.ADD };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Payments, "id" | "amount"> = {
				student_name: formData.get("student_name") as string,
				book_id: Number(formData.get("book_id") as string),
				book_amount: Number(formData.get("book_amount") as string) || 1,
				date: new Date(formData.get("date") as string).getTime() / 1000,
			};

			const res = await useAPI(
				API.Payments.post,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data) return;
			setActionPressed({
				action: ActionEnum.ADD,
				mutate: [res.data.id],
			});
		});
		return {
			inputs: Pick(
				PaymentsInputs(books),
				"book_id",
				"student_name",
				"book_amount",
				"date"
			),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Πληρωμής",
			icon: ActionIcon.ADD,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length !== 1)
			return { icon: ActionIcon.MODIFY };
		const payment = payments.find(
			(p) => p.id === selectedItems[0]
		) as Payments;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Pick<Payments, "id" | "amount"> = {
				id: payment.id,
				amount: Number(formData.get("amount") as string) as number,
			};
			if (
				data.amount > payment.amount ||
				data.amount === 0 ||
				!data.amount
			)
				return alert("Καταχώρηση μη επιτρεπτού ποσού!");
			const res = await useAPI(
				API.Payments.updatePayment,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({
				action: ActionEnum.MODIFY,
				mutate: [payment.id],
			});
			document.dispatchEvent(
				//@ts-ignore
				new CustomEvent("ModifySelections", {
					detail: { type: "remove", id: payment.id },
				})
			);
		});
		const filledInputs = Fill(PaymentsInputs(books), payment);
		return {
			inputs: Pick(filledInputs, "amount"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση πληρωμής",
			icon: ActionIcon.MODIFY,
		};
	});
	const onComplete = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length < 1)
			return { icon: ActionIcon.CHECK };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			let data = selectedItems.map(
				(id) => payments.find((p) => p.id === id) as Payments
			);
			if (data.filter((p) => p.payment_date !== 0).length > 0)
				return alert(
					"Δεν μπορείτε να ολοκληρώσετε πληρωμές που έχουν ήδη πληρωθεί!"
				);
			const res = await useAPI(
				API.Payments.complete,
				{
					RequestObject: data.map((p) => p.id),
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({
				action: ActionEnum.CHECK,
				mutate: selectedItems.slice(),
			});
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ολοκλήρωση",
			headerText: "Ολοκλήρωση πληρωμών",
			icon: ActionIcon.CHECK,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length < 1)
			return { icon: ActionIcon.DELETE };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			let data = selectedItems.map(
				(id) => payments.find((p) => p.id === id) as Payments
			);
			if (data.filter((p) => p.payment_date === 0).length)
				return alert(
					"Δεν μπορείτε να διαγράψετε πληρωμές που δεν έχουν πληρωθεί!"
				);
			const res = await useAPI(
				API.Payments.delete,
				{
					RequestObject: data.map((p) => p.id),
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({
				action: ActionEnum.DELETE,
				mutate: selectedItems.slice(),
			});
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή πληρωμών",
			icon: ActionIcon.DELETE,
		};
	});

	return (
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={store[API.Books.get] && store[API.Payments.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onAdd, onModify, onComplete, onDelete]}
						prefix={PREFIX}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

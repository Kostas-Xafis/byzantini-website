import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import type { Books, Payments } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import { Fill, Pick, type Props as InputProps, InputFields } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import {
	TableControl,
	TableControlsGroup,
	TopTableGroup,
	type Action,
} from "./table/TableControls.solid";
import type { ExtendedFormData } from "../../../lib/utils.client";

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

const paymentsToTable = (payments: Payments[], books: Books[]): PaymentsTable[] => {
	return payments.map((p) => {
		const columns = Object.values(p) as any[];
		columns[2] = books.find((b) => b.id === p.book_id)?.title;
		columns[3] = columns[3] + "€";
		return columns as unknown as PaymentsTable;
	});
};

const columnNames: ColumnType<PaymentsTable> = {
	id: { type: "number", name: "Id", size: 4 },
	student_name: { type: "string", name: "Μαθητής", size: 15 },
	title: { type: "string", name: "Βιβλίο", size: 25 },
	amount: { type: "number", name: "Οφειλή" },
	book_amount: { type: "number", name: "Ποσότητα" },
	date: { type: "date", name: "Ημερομηνία Παραλαβής" },
	payment_date: { type: "date", name: "Ημερομηνία Πληρωμής" },
};

export default function PaymentsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);

	const setPaymentHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Payments.getById,
				destEndpoint: API.Payments.get,
			},
		],
		sort: "descending",
	});
	useHydrate(() => {
		apiHook(API.Payments.get);
		apiHook(API.Books.get);
	});

	let shapedData = createMemo(() => {
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!books || !payments) return [];
		return books && payments ? paymentsToTable(payments, books) : [];
	});
	const onAdd = createMemo((): Action | EmptyAction => {
		const books = store[API.Books.get] || [];
		const submit = async function (form: ExtendedFormData<Payments>) {
			const data: Omit<Payments, "id" | "amount"> = {
				student_name: form.string("student_name"),
				book_id: form.number("book_id"),
				book_amount: form.number("book_amount", 1),
				date: form.date("payment_date").getTime() / 1000,
			};

			const res = await apiHook(API.Payments.post, { RequestObject: data });
			if (!res.data) return;
			setPaymentHydrate({
				action: ActionEnum.ADD,
				id: res.data.insertId,
			});
			pushAlert(createAlert("success", "Η αγορά προστέθηκε επιτυχώς!"));
		};
		return {
			inputs: new InputFields(PaymentsInputs(books))
				.pick(["book_id", "student_name", "book_amount", "date"])
				.getInputs(),
			onSubmit: submit,
			submitText: "Προσθήκη",
			headerText: "Εισαγωγή Πληρωμής",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
		};
	});
	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};

		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length !== 1) return modifyModal;

		const payment = payments.find((p) => p.id === selectedItems[0]) as Payments;
		if (payment.payment_date !== 0) return modifyModal;

		const submit = async function (form: ExtendedFormData<Payments>) {
			const data: Pick<Payments, "id" | "amount"> = {
				id: payment.id,
				amount: form.number("amount"),
			};
			if (data.amount > payment.amount || data.amount === 0 || !data.amount) {
				alert("Καταχώρηση μη επιτρεπτού ποσού!");
				throw new Error("Invalid amount");
			}
			const res = await apiHook(API.Payments.updatePayment, { RequestObject: data });
			if (!res.data && !res.message) return;
			setPaymentHydrate({
				action: ActionEnum.MODIFY,
				id: payment.id,
				isMultiple: false,
			});
			pushAlert(createAlert("success", "Η αγορά ενημερώθηκε επιτυχώς!"));
		};
		const filledInputs = Fill(PaymentsInputs(books), payment);
		return {
			inputs: Pick(filledInputs, "amount"),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Ενημέρωση πληρωμής",
			...modifyModal,
		};
	});
	const onComplete = createMemo((): Action | EmptyAction => {
		const completeModal = {
			type: ActionEnum.CHECK,
			icon: ActionIcon.CHECK,
		};
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length < 1) return completeModal;

		const selectedPayments = selectedItems.map(
			(id) => payments.find((p) => p.id === id) as Payments
		);
		if (selectedPayments.filter((p) => p.payment_date !== 0).length > 0) return completeModal;

		const submit = async function () {
			const res = await apiHook(API.Payments.complete, {
				RequestObject: selectedPayments.map((p) => p.id),
			});
			if (!res.data && !res.message) return;
			setPaymentHydrate({
				action: ActionEnum.CHECK,
				isMultiple: true,
				ids: selectedItems.slice(),
			});
			pushAlert(createAlert("success", "Οι πληρωμές ολοκληρώθηκαν επιτυχώς!"));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Ολοκλήρωση",
			headerText: "Ολοκλήρωση πληρωμών",
			...completeModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const books = store[API.Books.get];
		const payments = store[API.Payments.get];
		if (!payments || !books || selectedItems.length < 1) {
			return deleteModal;
		}
		const submit = async function () {
			let data = selectedItems.map((id) => payments.find((p) => p.id === id) as Payments);
			if (data.filter((p) => p.payment_date === 0).length)
				return alert("Δεν μπορείτε να διαγράψετε πληρωμές που δεν έχουν πληρωθεί!");
			const res = await apiHook(API.Payments.delete, {
				RequestObject: data.map((p) => p.id),
			});
			if (!res.data && !res.message) return;
			setPaymentHydrate({
				action: ActionEnum.DELETE,
				ids: selectedItems.slice(),
			});
			pushAlert(createAlert("success", "Οι πληρωμές διαγράφηκαν επιτυχώς!"));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή πληρωμών",
			...deleteModal,
		};
	});

	return (
		<Show
			when={store[API.Books.get] && store[API.Payments.get]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
				<TopTableGroup>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onModify} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
						<TableControl action={onComplete} prefix={PREFIX} />
					</TableControlsGroup>
				</TopTableGroup>
			</Table>
		</Show>
	);
}

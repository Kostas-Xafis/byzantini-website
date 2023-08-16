import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Wholesalers, SchoolPayoffs } from "../../../types/entities";
import type { Replace } from "../../../types/helpers";
import Table from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum } from "./table/TableControls.solid";
import { type Props as InputProps, Pick, Fill } from "../Input.solid";
import { ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "payoffs";

type ColumnType<T> = Record<keyof T, string | { name: string; size: () => number }>;
type SchoolPayoffsTable = Replace<SchoolPayoffs, "wholesaler_id", "wholesaler">;

const SchoolPayoffsInputs = (wholesalers: Wholesalers[]): Record<keyof SchoolPayoffs, InputProps> => {
	return {
		id: { name: "id", label: "Id", type: "number", iconClasses: "fa-solid fa-hashtag" },
		wholesaler_id: {
			name: "wholesaler_id",
			label: "Χονδρέμπορος",
			type: "select",
			iconClasses: "fa-regular fa-feather",
			selectList: wholesalers.map(w => w.name)
		},
		amount: {
			name: "amount",
			label: "Οφειλή",
			type: "number",
			iconClasses: "fa-solid fa-money-bills"
		}
	};
};

const payoffToTablePayoff = (payoff: SchoolPayoffs, wholesalers: Wholesalers[]): SchoolPayoffsTable => {
	const columns = Object.values(payoff);
	//@ts-ignore
	columns[1] = wholesalers.find(w => w.id === payoff.wholesaler_id)?.name;
	//@ts-ignore
	columns[2] = columns[2] + "€";
	return columns as unknown as SchoolPayoffsTable;
};

const payoffsToTable = (payoffs: SchoolPayoffs[], wholesalers: Wholesalers[]): SchoolPayoffsTable[] => {
	console.log(payoffs, wholesalers);
	return payoffs.map(p => payoffToTablePayoff(p, wholesalers));
};

export default function PayoffsTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		console.log("Hydrating table data");
		useAPI(setStore, API.Payoffs.get, {});
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
	const columnNames: ColumnType<SchoolPayoffsTable> = {
		id: "Id",
		wholesaler: { name: "Χονδρέμπορος", size: () => 20 },
		amount: "Οφειλή"
	};

	let shapedData = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		const payements = store[API.Payoffs.get];
		if (!wholesalers || !payements) return [];
		return wholesalers && payements ? payoffsToTable(payements, wholesalers) : [];
	});

	const onEdit = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length !== 1) return undefined;
		const payoff = payoffs.find(p => p.id === selectedItems[0]) as SchoolPayoffs;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<SchoolPayoffs, "wholesaler_id"> = {
				id: payoff.id,
				amount: Number(formData.get("amount") as string)
			};
			if (data.amount > payoff.amount || data.amount === 0) throw Error("Invalid amount");
			const res = await useAPI(setStore, API.Payoffs.updateAmount, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.EDIT);
		});
		const filledInputs = Fill(SchoolPayoffsInputs(wholesalers), payoff);
		return {
			inputs: Pick(filledInputs, "amount"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Οφειλής",
			type: ActionEnum.EDIT
		};
	});
	const onDelete = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length < 1) return undefined;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (payoffs.find(p => p.id === i) as SchoolPayoffs).id);
			const res = await useAPI(setStore, API.Payoffs.complete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ολοκλήρωση",
			headerText: "Ολοκλήρωση Οφειλών",
			type: ActionEnum.DELETE
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.Wholesalers.get] && store[API.Payoffs.get]} fallback={<Spinner />}>
				<Table prefix={PREFIX} data={shapedData} columnNames={columnNames}>
					<TableControls pressedAction={actionPressed} onEdit={onEdit} onDelete={onDelete} prefix={PREFIX} complete />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

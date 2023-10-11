import {
	API,
	type APIStore,
	useHydrate,
	useAPI,
} from "../../../lib/hooks/useAPI.solid";
import type { Wholesalers, Payoffs } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import Table, { type ColumnType } from "./table/Table.solid";
import { createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, {
	ActionEnum,
	type Action,
	type EmptyAction,
	ActionIcon,
} from "./table/TableControls.solid";
import { type Props as InputProps, Pick, Fill } from "../input/Input.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../other/Spinner.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";

const PREFIX = "payoffs";

type SchoolPayoffsTable = ReplaceName<Payoffs, "wholesaler_id", "wholesaler">;

const SchoolPayoffsInputs = (
	wholesalers: Wholesalers[]
): Record<keyof Payoffs, InputProps> => {
	return {
		id: {
			name: "id",
			label: "Id",
			type: "number",
			iconClasses: "fa-solid fa-hashtag",
		},
		wholesaler_id: {
			name: "wholesaler_id",
			label: "Χονδρέμπορος",
			type: "select",
			iconClasses: "fa-solid fa-feather",
			selectList: wholesalers.map((w) => w.name),
			valueList: wholesalers.map((w) => w.id),
		},
		amount: {
			name: "amount",
			label: "Οφειλή",
			type: "number",
			iconClasses: "fa-solid fa-money-bills",
		},
	};
};

const payoffsToTable = (
	payoffs: Payoffs[],
	wholesalers: Wholesalers[]
): SchoolPayoffsTable[] => {
	return payoffs.map((p) => {
		const columns = Object.values(p) as (string | number)[];
		columns[1] =
			wholesalers.find((w) => w.id === p.wholesaler_id)?.name || "";
		columns[2] = columns[2] + "€";
		return columns as unknown as SchoolPayoffsTable;
	});
};

const [selectedItems, setSelectedItems] = useSelectedRows();

export default function PayoffsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.Payoffs.getById,
		API.Payoffs.get
	);
	useHydrate(() => {
		useAPI(API.Payoffs.get, {}, setStore);
		useAPI(API.Wholesalers.get, {}, setStore);
	})(true);

	const columnNames: ColumnType<SchoolPayoffsTable> = {
		id: { type: "number", name: "Id" },
		wholesaler: { type: "string", name: "Χονδρέμπορος", size: 25 },
		amount: { type: "number", name: "Οφειλή" },
	};

	let shapedData = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		const payements = store[API.Payoffs.get];
		if (!wholesalers || !payements) return [];
		return wholesalers && payements
			? payoffsToTable(payements, wholesalers)
			: [];
	});

	const onModify = createMemo((): Action | EmptyAction => {
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length !== 1)
			return { icon: ActionIcon.MODIFY };
		const payoff = payoffs.find(
			(p) => p.id === selectedItems[0]
		) as Payoffs;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const formData = new FormData(e.currentTarget as HTMLFormElement);
			const data: Omit<Payoffs, "wholesaler_id"> = {
				id: payoff.id,
				amount: Number(formData.get("amount") as string),
			};
			if (data.amount > payoff.amount || data.amount === 0)
				throw Error("Invalid amount");
			const res = await useAPI(
				API.Payoffs.updateAmount,
				{
					RequestObject: data,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setActionPressed({
				action: ActionEnum.MODIFY,
				mutate: [payoff.id],
			});
		});
		const filledInputs = Fill(SchoolPayoffsInputs(wholesalers), payoff);
		return {
			inputs: Pick(filledInputs, "amount"),
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Οφειλής",

			icon: ActionIcon.MODIFY,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length < 1)
			return { icon: ActionIcon.CHECK };
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(
				(i) => (payoffs.find((p) => p.id === i) as Payoffs).id
			);
			const res = await useAPI(
				API.Payoffs.complete,
				{
					RequestObject: data,
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
			submitText: "Ολοκλήρωση",
			headerText: "Ολοκλήρωση Οφειλών",

			icon: ActionIcon.CHECK,
		};
	});

	return (
		<SelectedItemsContext.Provider
			value={[selectedItems, setSelectedItems]}
		>
			<Show
				when={store[API.Wholesalers.get] && store[API.Payoffs.get]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onModify, onDelete]}
						prefix={PREFIX}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

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
import type { Payoffs, Wholesalers } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import { Fill, Pick, type Props as InputProps } from "../input/Input.solid";
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
	const setPayoffHydrate = useHydrateById(setStore, [
		{
			srcEndpoint: API.Payoffs.getById,
			destEndpoint: API.Payoffs.get,
		},
	]);
	useHydrate(() => {
		useAPI(API.Payoffs.get, {}, setStore);
		useAPI(API.Wholesalers.get, {}, setStore);
	});

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
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length !== 1)
			return modifyModal;
		const payoff = payoffs.find(
			(p) => p.id === selectedItems[0]
		) as Payoffs;
		const submit = async function (form: HTMLFormElement) {
			const formData = new FormData(form);
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
			setPayoffHydrate({
				action: ActionEnum.MODIFY,
				ids: [payoff.id],
			});
		};
		const filledInputs = Fill(SchoolPayoffsInputs(wholesalers), payoff);
		return {
			inputs: Pick(filledInputs, "amount"),
			onSubmit: submit,
			submitText: "Ενημέρωση",
			headerText: "Επεξεργασία Οφειλής",
			...modifyModal,
		};
	});
	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE,
		};
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || selectedItems.length < 1) {
			return deleteModal;
		}
		const submit = async function (form: HTMLFormElement) {
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
			setPayoffHydrate({
				action: ActionEnum.DELETE,
				ids: selectedItems.slice(),
			});
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Ολοκλήρωση",
			headerText: "Ολοκλήρωση Οφειλών",
			...deleteModal,
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
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onModify} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

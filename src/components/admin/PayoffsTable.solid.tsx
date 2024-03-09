import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import type { Payoffs, Wholesalers } from "../../../types/entities";
import type { ReplaceName } from "../../../types/helpers";
import { Fill, Pick, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";

const PREFIX = "payoffs";

type SchoolPayoffsTable = ReplaceName<Payoffs, "wholesaler_id", "wholesaler", number>;

const SchoolPayoffsInputs = (wholesalers: Wholesalers[]): Record<keyof Payoffs, InputProps> => {
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

const payoffsToTable = (payoffs: Payoffs[], wholesalers: Wholesalers[]): SchoolPayoffsTable[] => {
	return payoffs.map((p) => {
		const columns = Object.values(p) as any[];
		columns[1] = wholesalers.find((w) => w.id === p.wholesaler_id)?.name;
		columns[2] = columns[2] + "€";
		return columns as unknown as SchoolPayoffsTable;
	});
};

export default function PayoffsTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setPayoffHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.Payoffs.getById,
				destEndpoint: API.Payoffs.get,
			},
		],
	});
	useHydrate(() => {
		apiHook(API.Payoffs.get);
		apiHook(API.Wholesalers.get);
	});

	const columnNames: ColumnType<SchoolPayoffsTable> = {
		id: { type: "number", name: "Id", size: 4 },
		wholesaler: { type: "string", name: "Χονδρέμπορος", size: 25 },
		amount: { type: "number", name: "Οφειλή" },
	};

	let shapedData = createMemo(() => {
		const wholesalers = store[API.Wholesalers.get];
		const payements = store[API.Payoffs.get];
		if (!wholesalers || !payements) return [];
		return wholesalers && payements ? payoffsToTable(payements, wholesalers) : [];
	});

	const onModify = createMemo((): Action | EmptyAction => {
		const modifyModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const wholesalers = store[API.Wholesalers.get];
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || !wholesalers || selectedItems.length !== 1) return modifyModal;
		const payoff = payoffs.find((p) => p.id === selectedItems[0]) as Payoffs;
		const submit = async function (formData: FormData) {
			const data: Omit<Payoffs, "wholesaler_id"> = {
				id: payoff.id,
				amount: Number(formData.get("amount") as string),
			};
			if (data.amount > payoff.amount || data.amount === 0) throw Error("Invalid amount");
			const res = await apiHook(API.Payoffs.updateAmount, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setPayoffHydrate({
				action: ActionEnum.MODIFY,
				ids: [payoff.id],
			});
			pushAlert(createAlert("success", "Η οφειλή ενημερώθηκε επιτυχώς!"));
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
			type: ActionEnum.CHECK,
			icon: ActionIcon.CHECK,
		};
		const payoffs = store[API.Payoffs.get];
		if (!payoffs || selectedItems.length < 1) {
			return deleteModal;
		}
		const submit = async function () {
			const data = selectedItems.map((i) => (payoffs.find((p) => p.id === i) as Payoffs).id);
			const res = await apiHook(API.Payoffs.complete, {
				RequestObject: data,
			});
			if (!res.data && !res.message) return;
			setPayoffHydrate({
				action: ActionEnum.CHECK,
				ids: selectedItems.slice(),
			});
			if (selectedItems.length === 1) {
				pushAlert(createAlert("success", "Η οφειλή ολοκληρώθηκε επιτυχώς!"));
				return;
			}
			pushAlert(createAlert("success", "Οι οφειλές ολοκληρώθηκαν επιτυχώς!"));
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
		<Show
			when={store[API.Wholesalers.get] && store[API.Payoffs.get]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
				<TableControlsGroup prefix={PREFIX}>
					<TableControl action={onModify} prefix={PREFIX} />
					<TableControl action={onDelete} prefix={PREFIX} />
				</TableControlsGroup>
			</Table>
		</Show>
	);
}

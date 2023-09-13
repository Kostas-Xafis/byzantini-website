import { API, type APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { SysUsers as FullSysUser } from "../../../types/entities";
import Table, { type ColumnType } from "./table/Table.solid";
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import TableControls, { ActionEnum, type Action, type EmptyAction, ActionIcon } from "./table/TableControls.solid";
import { type ContextType, SelectedItemsContext } from "./table/SelectedRowContext.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";
import Spinner from "../Spinner.solid";

const PREFIX = "sysusers";

type SysUsers = Pick<FullSysUser, "id" | "email" | "privilege">;

const sysuserToTableSysuser = (sysuser: SysUsers): SysUsers => {
	const columns = Object.values(sysuser);

	columns[2] = columns[2] === 2 ? "Super Admin" : columns[2] === 1 ? "Διαχειριστής Συστήματος" : "Διαχειριστής";
	return columns as unknown as SysUsers;
};

const sysusersToTable = (sysusers: SysUsers[]): SysUsers[] => {
	return sysusers.map(u => sysuserToTableSysuser(u));
};

export default function SysUsersTable() {
	const [actionPressed, setActionPressed] = createSignal(ActionEnum.NONE, { equals: false });
	const [store, setStore] = createStore<APIStore>({});
	const hydrate = createHydration(() => {
		useAPI(setStore, API.SysUsers.get, {});
		useAPI(setStore, API.SysUsers.getBySid, {});
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
	const columnNames: ColumnType<SysUsers> = {
		id: { type: "number", name: "Id" },
		email: { type: "string", name: "Email", size: () => 25 },
		privilege: { type: "string", name: "Δικαιώματα", size: () => 25 }
	};

	const shapedData = createMemo(() => {
		const sysusers = store[API.SysUsers.get];
		return sysusers ? sysusersToTable(sysusers) : [];
	});

	const onAdd = createMemo((): Action | EmptyAction => {
		const link = store[API.SysUsers.createRegisterLink]?.link;
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			if (!link) await useAPI(setStore, API.SysUsers.createRegisterLink, {});
			setTimeout(() => {
				//@ts-ignore
				document.querySelector("div[data-prefix='sysusers'] button:first-child").click();
			}, 200);
			setActionPressed(ActionEnum.ADD);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: !link ? "Δημιουργία" : "Ολοκλήρωση",
			headerText: !link ? "Δημιουργία link εγγραφής" : "Link εγγραφής:\n https://musicschool-metamorfosi.gr/admin/signup/" + link,
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_USER
		};
	});

	const onDelete = createMemo((): Action | EmptyAction => {
		const sysusers = store[API.SysUsers.get];
		const self = store[API.SysUsers.getBySid];
		if (!sysusers || selectedItems.length < 1 || !self) return { icon: ActionIcon.DELETE_USER };

		const selectedSysUsers = selectedItems.map(i => sysusers.find(p => p.id === i) as SysUsers);
		if (!selectedSysUsers.find(s => s.privilege < self.privilege || (s.privilege === self.privilege && s.id === self.id)))
			return { icon: ActionIcon.DELETE_USER };

		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(i => (sysusers.find(p => p.id === i) as SysUsers).id);
			const res = await useAPI(setStore, API.SysUsers.delete, { RequestObject: data });
			if (!res.data && !res.message) return;
			setActionPressed(ActionEnum.DELETE);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Διαχειριστή/ών",
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show when={store[API.SysUsers.get] && store[API.SysUsers.getBySid]} fallback={<Spinner />}>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls pressedAction={actionPressed} onActionsArray={[onAdd, onDelete]} prefix={PREFIX} />
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

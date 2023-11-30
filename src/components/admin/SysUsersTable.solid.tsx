import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import type { SysUsers as FullSysUser } from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import { SelectedItemsContext } from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { TableControl, type Action, TableControlsGroup } from "./table/TableControls.solid";
import { useSelectedRows } from "../../../lib/hooks/useSelectedRows.solid";

const PREFIX = "sysusers";

type SysUsers = Pick<FullSysUser, "id" | "email" | "privilege">;

const sysusersToTable = (sysusers: SysUsers[]): SysUsers[] => {
	return sysusers.map((u) => {
		const columns = Object.values(u);
		columns[2] =
			columns[2] === 2
				? "Super Admin"
				: columns[2] === 1
				? "Διαχειριστής Συστήματος"
				: "Διαχειριστής";
		return columns as unknown as SysUsers;
	});
};
const [selectedItems, setSelectedItems] = useSelectedRows();

export default function SysUsersTable() {
	const [store, setStore] = createStore<APIStore>({});
	const setSysUserHydrate = useHydrateById(setStore, [
		{
			srcEndpoint: API.SysUsers.getById,
			destEndpoint: API.SysUsers.get,
		},
	]);
	useHydrate(() => {
		useAPI(API.SysUsers.get, {}, setStore);
		useAPI(API.SysUsers.getBySid, {}, setStore);
	});

	const columnNames: ColumnType<SysUsers> = {
		id: { type: "number", name: "Id" },
		email: { type: "string", name: "Email", size: 25 },
		privilege: { type: "string", name: "Δικαιώματα", size: 25 },
	};

	const shapedData = createMemo(() => {
		const sysusers = store[API.SysUsers.get];
		return sysusers ? sysusersToTable(sysusers) : [];
	});

	const onAdd = createMemo((): Action | EmptyAction => {
		const link = store[API.SysUsers.createRegisterLink]?.link;
		const submit = async function (form: HTMLFormElement) {
			if (!link) {
				await useAPI(API.SysUsers.createRegisterLink, {}, setStore);
			}
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: !link ? "Δημιουργία" : "Ολοκλήρωση",
			headerText: !link
				? "Δημιουργία link εγγραφής"
				: "Link εγγραφής:\n https://musicschool-metamorfosi.gr/admin/signup/" + link,
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_USER,
		};
	});

	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER,
		};
		const sysusers = store[API.SysUsers.get];
		const self = store[API.SysUsers.getBySid];
		if (!sysusers || selectedItems.length < 1 || !self) return deleteModal;

		const selectedSysUsers = selectedItems.map(
			(i) => sysusers.find((p) => p.id === i) as SysUsers
		);
		if (
			!selectedSysUsers.find(
				(s) =>
					s.privilege < self.privilege ||
					(s.privilege === self.privilege && s.id === self.id)
			)
		)
			return deleteModal;

		const submit = async function (form: HTMLFormElement) {
			const ids = selectedItems.map((i) => (sysusers.find((p) => p.id === i) as SysUsers).id);
			const res = await useAPI(
				API.SysUsers.delete,
				{
					RequestObject: ids,
				},
				setStore
			);
			if (!res.data && !res.message) return;
			setSysUserHydrate({ action: ActionEnum.DELETE, ids });
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Διαχειριστή/ών",
			...deleteModal,
		};
	});

	return (
		<SelectedItemsContext.Provider value={[selectedItems, setSelectedItems]}>
			<Show
				when={store[API.SysUsers.get] && store[API.SysUsers.getBySid]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

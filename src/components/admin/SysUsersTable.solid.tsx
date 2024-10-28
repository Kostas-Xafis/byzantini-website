import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import { SelectedRows } from "../../../lib/hooks/useSelectedRows.solid";
import type { SysUsers as FullSysUser } from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import {
	TableControl,
	TableControlsGroup,
	type Action,
	TopTableGroup,
} from "./table/TableControls.solid";

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

export default function SysUsersTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	const setSysUserHydrate = useHydrateById({
		setStore,
		mutations: [
			{
				srcEndpoint: API.SysUsers.getById,
				destEndpoint: API.SysUsers.get,
			},
		],
	});
	useHydrate(() => {
		apiHook(API.SysUsers.get);
		apiHook(API.SysUsers.getBySid);
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
		const submit = async function* () {
			if (link) return;

			await apiHook(API.SysUsers.createRegisterLink);
			yield undefined;
			pushAlert(createAlert("success", "Ο σύνδεσμος δημιουργήθηκε επιτυχώς!"));
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: !link ? "Δημιουργία" : "Ολοκλήρωση",
			headerText: !link
				? "Δημιουργία link εγγραφής"
				: `Link εγγραφής:\n ${window.location.origin}/admin/signup/${link}`,
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

		const submit = async function () {
			const ids = selectedItems.map((i) => (sysusers.find((p) => p.id === i) as SysUsers).id);
			const res = await apiHook(API.SysUsers.delete, { RequestObject: ids });
			if (!res.data && !res.message) return;
			setSysUserHydrate({ action: ActionEnum.DELETE, ids });
			if (ids.length === 1) {
				pushAlert(createAlert("success", "Ο χρήστης διαγράφηκε επιτυχώς!"));
			} else {
				pushAlert(createAlert("success", "Οι χρήστες διαγράφηκαν επιτυχώς!"));
			}
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
		<Show
			when={store[API.SysUsers.get] && store[API.SysUsers.getBySid]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
				<TopTableGroup>
					<TableControlsGroup prefix={PREFIX}>
						<TableControl action={onAdd} prefix={PREFIX} />
						<TableControl action={onDelete} prefix={PREFIX} />
					</TableControlsGroup>
				</TopTableGroup>
			</Table>
		</Show>
	);
}

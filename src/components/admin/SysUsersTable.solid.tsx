import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import {
	API,
	useAPI,
	useHydrate,
	type APIStore,
} from "../../../lib/hooks/useAPI.solid";
import { useHydrateById } from "../../../lib/hooks/useHydrateById.solid";
import type { SysUsers as FullSysUser } from "../../../types/entities";
import Spinner from "../other/Spinner.solid";
import {
	SelectedItemsContext,
	type ContextType,
} from "./table/SelectedRowContext.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import {
	ActionEnum,
	ActionIcon,
	type EmptyAction,
} from "./table/TableControlTypes";
import TableControls, { type Action } from "./table/TableControls.solid";
import { formErrorWrap, formListener } from "./table/formSubmit";

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
	const [store, setStore] = createStore<APIStore>({});
	const [actionPressed, setActionPressed] = useHydrateById(
		setStore,
		API.SysUsers.getById,
		API.SysUsers.get
	);
	useHydrate(() => {
		useAPI(API.SysUsers.get, {}, setStore);
		useAPI(API.SysUsers.getBySid, {}, setStore);
	})(true);

	const [selectedItems, setSelectedItems] = createStore<number[]>([]);
	const ROWS = [
		selectedItems,
		{
			add: (id: number) => {
				setSelectedItems([...selectedItems, id]);
			},
			remove: (id: number) => {
				setSelectedItems(selectedItems.filter((i) => i !== id));
			},
			removeAll: () => {
				setSelectedItems([]);
			},
		},
	] as const;
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
		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			if (!link)
				await useAPI(API.SysUsers.createRegisterLink, {}, setStore);
			setTimeout(() => {
				document
					.querySelector<HTMLElement>(
						"div[data-prefix='sysusers'] button:first-child"
					)
					?.click();
			}, 200);
		});
		return {
			inputs: {},
			onMount: () => formListener(submit, true, PREFIX),
			onCleanup: () => formListener(submit, false, PREFIX),
			submitText: !link ? "Δημιουργία" : "Ολοκλήρωση",
			headerText: !link
				? "Δημιουργία link εγγραφής"
				: "Link εγγραφής:\n https://musicschool-metamorfosi.gr/admin/signup/" +
				  link,

			icon: ActionIcon.ADD_USER,
		};
	});

	const onDelete = createMemo((): Action | EmptyAction => {
		const sysusers = store[API.SysUsers.get];
		const self = store[API.SysUsers.getBySid];
		if (!sysusers || selectedItems.length < 1 || !self)
			return { icon: ActionIcon.DELETE_USER };

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
			return { icon: ActionIcon.DELETE_USER };

		const submit = formErrorWrap(async function (e: Event) {
			e.preventDefault();
			e.stopPropagation();
			const data = selectedItems.map(
				(i) => (sysusers.find((p) => p.id === i) as SysUsers).id
			);
			const res = await useAPI(
				API.SysUsers.delete,
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
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Διαχειριστή/ών",

			icon: ActionIcon.DELETE_USER,
		};
	});

	return (
		<SelectedItemsContext.Provider value={ROWS as ContextType}>
			<Show
				when={store[API.SysUsers.get] && store[API.SysUsers.getBySid]}
				fallback={<Spinner classes="max-sm:h-[100svh]" />}
			>
				<Table prefix={PREFIX} data={shapedData} columns={columnNames}>
					<TableControls
						pressedAction={actionPressed}
						onActionsArray={[onAdd, onDelete]}
						prefix={PREFIX}
					/>
				</Table>
			</Show>
		</SelectedItemsContext.Provider>
	);
}

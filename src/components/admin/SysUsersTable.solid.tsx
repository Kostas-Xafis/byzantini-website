import type { SysUsers as FullSysUser } from "@_types/entities";
import { API, useAPI, useHydrate, type APIStore } from "@lib/hooks/useAPI.solid";
import { useHydrateById } from "@lib/hooks/useHydrateById.solid";
import { SelectedRows } from "@lib/hooks/useSelectedRows.solid";
import type { ExtendedFormData } from "@utilities/forms";
import { Show, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";

const PREFIX = "sysusers";
const SYSUSER_OWNER_EMAIL = "koxafis@gmail.com";

type SysUsers = Pick<FullSysUser, "id" | "email">;

const sysusersToTable = (sysusers: SysUsers[]): SysUsers[] => {
	return sysusers.map((u) => {
		return Object.values(u) as unknown as SysUsers;
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
		id: { type: "number", name: "Id", size: 4 },
		email: { type: "string", name: "Email", size: 30 },
	};

	const shapedData = createMemo(() => {
		const sysusers = store[API.SysUsers.get];
		return Array.isArray(sysusers) ? sysusersToTable(sysusers as SysUsers[]) : [];
	});

	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: ExtendedFormData<{ invite_email: string }>) {
			const inviteEmail = formData.string("invite_email").trim();
			if (!inviteEmail) throw new Error("Συμπληρώστε έγκυρο email");

			const res = await apiHook(API.SysUsers.createRegisterLink, {
				RequestObject: { email: inviteEmail },
			});
			if (!res.data && !res.message) return;
			pushAlert(createAlert("success", "Το email πρόσκλησης στάλθηκε επιτυχώς!"));
		};
		return {
			inputs: {
				email: {
					name: "invite_email",
					label: "Email νέου διαχειριστή",
					type: "email",
					iconClasses: "fa-solid fa-envelope",
					required: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Αποστολή",
			headerText: "Αποστολή πρόσκλησης εγγραφής",
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

		const canDeleteOthers = self.email === SYSUSER_OWNER_EMAIL;
		const hasOthersSelected = selectedItems.some((id) => id !== self.id);
		if (!canDeleteOthers && hasOthersSelected) return deleteModal;

		const submit = async function () {
			const ids = selectedItems.map((i) => (sysusers.find((p) => p.id === i) as SysUsers).id);
			const res = await apiHook(API.SysUsers.delete, { RequestObject: ids });
			if (!res.data && !res.message) return;
			setSysUserHydrate({ action: ActionEnum.DELETE, ids });
			if (ids.length === 1) {
				pushAlert(createAlert("success", "Ο διαχειριστής διαγράφηκε επιτυχώς!"));
			} else {
				pushAlert(createAlert("success", "Οι διαχειριστές διαγράφηκαν επιτυχώς!"));
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
			when={store[API.SysUsers.get] !== undefined}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table
				prefix={PREFIX}
				data={shapedData}
				columns={columnNames}
				structure={[
					{
						position: "top",
						prefix: PREFIX,
						controlGroups: [{ controls: [onAdd, onDelete] }],
					},
				]}
			/>
		</Show>
	);
}
